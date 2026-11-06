// Package compat checks builder parts (BR-25 to BR-29, BR-35, FR-10 to FR-17). Pure functions.
package compat

import (
	"fmt"
	"slices"
	"sort"

	"bitbaan/backend/internal/catalog"
	"bitbaan/backend/internal/pricing"
)

// Cats are the builder slots in display order (API-CONTRACT 3.2).
var Cats = []string{"cpu", "mb", "ram", "gpu", "ssd", "psu", "case"}

var catOf = map[string]string{"cpu": "CPU", "mb": "MB", "ram": "RAM", "gpu": "GPU", "ssd": "SSD", "psu": "PSU", "case": "CASE"}

func ProductCat(slot string) string { return catOf[slot] }

type Conflict struct {
	Categories []string `json:"categories"`
	Code       string   `json:"code"`
	Message    string   `json:"message"`
}

type Warning struct {
	Code       string `json:"code"`
	Message    string `json:"message"`
	SuggestSKU string `json:"suggestSku,omitempty"`
}

type Option struct {
	SKU     string  `json:"sku"`
	Allowed bool    `json:"allowed"`
	Reason  *string `json:"reason"`
}

// Result is in baht; the API converts money to satang.
type Result struct {
	Total             int64
	Budget            *int64
	Remaining         *int64
	OverBudget        bool
	AssemblyFee       int64
	MissingCategories []string
	Conflicts         []Conflict
	Warnings          []Warning
	Options           map[string][]Option
	CanAddToCart      bool
}

// pairCheck returns a conflict between two parts, or nil (order-independent, FR-11).
func pairCheck(aSlot string, a catalog.Item, bSlot string, b catalog.Item) *Conflict {
	get := func(slot string) (catalog.Item, bool) {
		if aSlot == slot {
			return a, true
		}
		if bSlot == slot {
			return b, true
		}
		return catalog.Item{}, false
	}
	pair := []string{aSlot, bSlot}
	sort.Slice(pair, func(i, j int) bool { return slices.Index(Cats, pair[i]) < slices.Index(Cats, pair[j]) })
	cpu, hasCPU := get("cpu")
	mb, hasMB := get("mb")
	ram, hasRAM := get("ram")
	gpu, hasGPU := get("gpu")
	cs, hasCase := get("case")
	switch {
	case hasCPU && hasMB:
		if *cpu.Specs.Socket != *mb.Specs.Socket {
			return &Conflict{pair, "SOCKET_MISMATCH", fmt.Sprintf("socket ไม่ตรง: CPU ใช้ %s บอร์ดใช้ %s", *cpu.Specs.Socket, *mb.Specs.Socket)}
		}
	case hasMB && hasRAM:
		if *mb.Specs.RAMType != *ram.Specs.RAMType {
			return &Conflict{pair, "RAM_MISMATCH", fmt.Sprintf("บอร์ดนี้รับ %s แต่แรมเป็น %s", *mb.Specs.RAMType, *ram.Specs.RAMType)}
		}
	case hasGPU && hasCase:
		if *gpu.Specs.GPULengthMm > *cs.Specs.CaseMaxGPUMm {
			return &Conflict{pair, "GPU_TOO_LONG", fmt.Sprintf("การ์ดจอยาว %d mm เคสรับ %d mm", *gpu.Specs.GPULengthMm, *cs.Specs.CaseMaxGPUMm)}
		}
	case hasMB && hasCase:
		if !slices.Contains(cs.Specs.CaseSupports, *mb.Specs.FormFactor) {
			return &Conflict{pair, "FORM_FACTOR", fmt.Sprintf("เคสไม่รับบอร์ดขนาด %s", *mb.Specs.FormFactor)}
		}
	}
	return nil
}

// optionReason explains why candidate cannot be chosen given the other selected parts (FR-10).
func optionReason(slot string, cand catalog.Item, sel map[string]catalog.Item) *string {
	for _, other := range Cats {
		if other == slot {
			continue
		}
		o, ok := sel[other]
		if !ok {
			continue
		}
		if c := pairCheck(slot, cand, other, o); c != nil {
			m := c.Message
			return &m
		}
	}
	return nil
}

// Evaluate checks a builder selection (sku per slot, "" = empty) at the given unit prices.
func Evaluate(parts map[string]string, budget *int64, assembly bool, unitPrice func(pricing.Product) int64) Result {
	sel := map[string]catalog.Item{}
	for _, slot := range Cats {
		if sku := parts[slot]; sku != "" {
			if it, ok := catalog.BySKU(sku); ok && it.InBuilder && it.Category == catOf[slot] {
				sel[slot] = it
			}
		}
	}
	r := Result{Options: map[string][]Option{}, Conflicts: []Conflict{}, Warnings: []Warning{}, MissingCategories: []string{}}
	for _, slot := range Cats {
		if it, ok := sel[slot]; ok {
			r.Total += unitPrice(it.Product)
		} else {
			r.MissingCategories = append(r.MissingCategories, slot)
		}
	}
	// conflicts among selected parts
	for i, a := range Cats {
		for _, b := range Cats[i+1:] {
			ia, okA := sel[a]
			ib, okB := sel[b]
			if okA && okB {
				if c := pairCheck(a, ia, b, ib); c != nil {
					r.Conflicts = append(r.Conflicts, *c)
				}
			}
		}
	}
	// PSU warning (BR-29): only when both GPU and PSU are chosen
	if gpu, ok := sel["gpu"]; ok {
		if psu, ok := sel["psu"]; ok && *psu.Specs.PSUOutputW < *gpu.Specs.RecommendedPSUW {
			w := Warning{Code: "PSU_LOW", Message: fmt.Sprintf("พาวเวอร์อาจไม่พอ: %dW < ที่การ์ดจอแนะนำ %dW", *psu.Specs.PSUOutputW, *gpu.Specs.RecommendedPSUW)}
			best := int64(-1)
			for _, it := range catalog.Items {
				if it.Category == "PSU" && *it.Specs.PSUOutputW >= *gpu.Specs.RecommendedPSUW && (best < 0 || it.Price < best) {
					best, w.SuggestSKU = it.Price, it.SKU
				}
			}
			r.Warnings = append(r.Warnings, w)
		}
	}
	// options per slot
	for _, slot := range Cats {
		opts := []Option{}
		for _, it := range catalog.Items {
			if !it.InBuilder || it.Category != catOf[slot] {
				continue
			}
			reason := optionReason(slot, it, sel)
			opts = append(opts, Option{SKU: it.SKU, Allowed: reason == nil, Reason: reason})
		}
		r.Options[slot] = opts
	}
	if budget != nil {
		rem := *budget - r.Total
		r.Budget, r.Remaining, r.OverBudget = budget, &rem, rem < 0
	}
	if assembly {
		r.AssemblyFee = 500
		if len(r.MissingCategories) == 0 {
			r.AssemblyFee = 0
		}
	}
	r.CanAddToCart = len(r.Conflicts) == 0 && len(sel) > 0
	return r
}
