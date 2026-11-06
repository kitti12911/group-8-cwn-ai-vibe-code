package compat

import (
	"testing"

	"bitbaan/backend/internal/pricing"
)

func list(p pricing.Product) int64 { return p.Price }

func codes(r Result) map[string]bool {
	m := map[string]bool{}
	for _, c := range r.Conflicts {
		m[c.Code] = true
	}
	return m
}

func TestPairs(t *testing.T) { // TEST-DATA.md 3.2, E76–E100
	cases := []struct {
		parts map[string]string
		code  string // "" = no conflict
	}{
		{map[string]string{"cpu": "CPU-N5", "mb": "MB-B6"}, ""},
		{map[string]string{"cpu": "CPU-N5", "mb": "MB-X7"}, "SOCKET_MISMATCH"},
		{map[string]string{"cpu": "CPU-N7", "mb": "MB-B6"}, "SOCKET_MISMATCH"},
		{map[string]string{"cpu": "CPU-N7", "mb": "MB-X7"}, ""},
		{map[string]string{"mb": "MB-B6", "ram": "RAM-D4"}, ""},
		{map[string]string{"mb": "MB-B6", "ram": "RAM-16"}, "RAM_MISMATCH"},
		{map[string]string{"mb": "MB-X7", "ram": "RAM-D4"}, "RAM_MISMATCH"},
		{map[string]string{"mb": "MB-X7", "ram": "RAM-32"}, ""},
		{map[string]string{"gpu": "GPU-V46", "case": "CASE-M"}, ""},
		{map[string]string{"gpu": "GPU-V57", "case": "CASE-M"}, "GPU_TOO_LONG"},
		{map[string]string{"gpu": "GPU-V57", "case": "CASE-L"}, ""},
		{map[string]string{"mb": "MB-B6", "case": "CASE-M"}, ""},
		{map[string]string{"mb": "MB-X7", "case": "CASE-M"}, "FORM_FACTOR"},
		{map[string]string{"mb": "MB-X7", "case": "CASE-L"}, ""},
		{map[string]string{"mb": "MB-B6", "case": "CASE-L"}, ""},
	}
	for _, c := range cases {
		r := Evaluate(c.parts, nil, false, list)
		got := codes(r)
		if c.code == "" && len(got) > 0 || c.code != "" && !got[c.code] {
			t.Errorf("%v: conflicts %v, want %q", c.parts, r.Conflicts, c.code)
		}
		if (c.code == "") != r.CanAddToCart {
			t.Errorf("%v: canAddToCart %v", c.parts, r.CanAddToCart)
		}
	}
}

func TestPSUWarning(t *testing.T) {
	cases := []struct {
		gpu, psu string
		warn     bool
	}{{"GPU-V46", "PSU-550", false}, {"GPU-V57", "PSU-550", true}, {"GPU-V57", "PSU-750", false}, {"", "PSU-550", false}}
	for _, c := range cases {
		r := Evaluate(map[string]string{"gpu": c.gpu, "psu": c.psu}, nil, false, list)
		if (len(r.Warnings) > 0) != c.warn {
			t.Errorf("%s+%s warnings %v", c.gpu, c.psu, r.Warnings)
		}
		if c.warn && r.Warnings[0].SuggestSKU != "PSU-750" {
			t.Errorf("suggest %s", r.Warnings[0].SuggestSKU)
		}
		if !r.CanAddToCart && c.gpu != "" {
			t.Errorf("PSU warning must not block (FR-13)")
		}
	}
}

func TestOptionsAndBudget(t *testing.T) {
	r := Evaluate(map[string]string{"mb": "MB-B6"}, nil, false, list)
	for _, o := range r.Options["ram"] {
		want := o.SKU == "RAM-D4"
		if o.Allowed != want {
			t.Errorf("ram option %s allowed=%v", o.SKU, o.Allowed)
		}
	}
	budget := int64(35000)
	full := map[string]string{"cpu": "CPU-N5", "mb": "MB-B6", "ram": "RAM-D4", "gpu": "GPU-V46", "ssd": "SSD-1T", "psu": "PSU-550", "case": "CASE-M"}
	r = Evaluate(full, &budget, true, list)
	if r.Total != 29430 || *r.Remaining != 5570 || r.AssemblyFee != 0 {
		t.Errorf("full build: total %d remaining %d fee %d", r.Total, *r.Remaining, r.AssemblyFee)
	}
	delete(full, "gpu")
	r = Evaluate(full, &budget, true, list)
	if r.AssemblyFee != 500 || len(r.MissingCategories) != 1 {
		t.Errorf("six build: fee %d missing %v", r.AssemblyFee, r.MissingCategories)
	}
}
