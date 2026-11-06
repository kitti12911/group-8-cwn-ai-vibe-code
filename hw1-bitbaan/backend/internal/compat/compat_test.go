package compat

import (
	"testing"

	"bitbaan/backend/internal/catalog"
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

// ---- mutation รอบ 5 · MUTATION-REPORT.md ข้อ 6 ----

func synthGPU(mm int) catalog.Item {
	return catalog.Item{Product: pricing.Product{SKU: "SYN-GPU", Category: "GPU"}, InBuilder: true, Specs: catalog.Specs{GPULengthMm: &mm}}
}
func synthCase(mm int) catalog.Item {
	return catalog.Item{Product: pricing.Product{SKU: "SYN-CASE", Category: "CASE"}, InBuilder: true, Specs: catalog.Specs{CaseMaxGPUMm: &mm}}
}

// E84–E86: การ์ดจอยาวเท่าที่เคสรับพอดีต้องใส่ได้ · ยาวเกิน 1 mm ใส่ไม่ได้ (BR-27) · ฆ่า compat.go:80 > → >=
func TestGPULengthBoundary(t *testing.T) {
	for _, c := range []struct {
		gpu  int
		fits bool
	}{{299, true}, {300, true}, {301, false}} {
		got := pairCheck("gpu", synthGPU(c.gpu), "case", synthCase(300)) == nil
		if got != c.fits {
			t.Errorf("การ์ดจอ %d mm เคสรับ 300 mm: ใส่ได้ = %v ต้องเป็น %v", c.gpu, got, c.fits)
		}
	}
}

// E120: งบเหลือ ฿0 พอดีไม่ใช่ "เกินงบ" · เกิน ฿1 คือเกิน (BR-35) · ฆ่า compat.go:166 rem < 0 → <=
func TestBudgetExactlyZero(t *testing.T) {
	parts := map[string]string{"cpu": "CPU-N5"}
	exact := int64(6290)
	if r := Evaluate(parts, &exact, false, list); r.OverBudget || *r.Remaining != 0 {
		t.Errorf("งบ 6,290 พอดีกับ CPU-N5: overBudget=%v remaining=%d ต้องเป็น false / 0", r.OverBudget, *r.Remaining)
	}
	under := int64(6289)
	if r := Evaluate(parts, &under, false, list); !r.OverBudget || *r.Remaining != -1 {
		t.Errorf("งบ 6,289: overBudget=%v remaining=%d ต้องเป็น true / −1", r.OverBudget, *r.Remaining)
	}
}

// สเปกว่างเปล่ากดใส่ตะกร้าไม่ได้ · มี 1 ชิ้นกดได้ (FR-16) · ฆ่า compat.go:174 len(sel) > 0 → >=
func TestEmptyBuildCannotAddToCart(t *testing.T) {
	if r := Evaluate(map[string]string{}, nil, false, list); r.CanAddToCart {
		t.Error("สเปกว่างเปล่าต้องกดใส่ตะกร้าไม่ได้")
	}
	if r := Evaluate(map[string]string{"ssd": "SSD-1T"}, nil, false, list); !r.CanAddToCart {
		t.Error("สเปกที่มี SSD 1 ชิ้นต้องกดใส่ตะกร้าได้")
	}
}
