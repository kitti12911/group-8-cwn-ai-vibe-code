// Package catalog holds the shop's 15 products exactly as INTERVIEW.md 6.1 / TEST-DATA.md 3.1 give them.
package catalog

import "bitbaan/backend/internal/pricing"

type Specs struct {
	Socket          *string  `json:"socket"`
	RAMType         *string  `json:"ramType"`
	FormFactor      *string  `json:"formFactor"`
	CaseSupports    []string `json:"caseSupports"`
	GPULengthMm     *int     `json:"gpuLengthMm"`
	CaseMaxGPUMm    *int     `json:"caseMaxGpuMm"`
	TDPW            *int     `json:"tdpW"`
	RecommendedPSUW *int     `json:"recommendedPsuW"`
	PSUOutputW      *int     `json:"psuOutputW"`
}

type Item struct {
	pricing.Product
	Stock         int // sellable after reset (6.1 stock column, T-06)
	OnHand        int
	PerBuyerLimit *int
	InBuilder     bool
	Specs         Specs
}

func s(v string) *string { return &v }
func i(v int) *int       { return &v }

var one = 1

// Items in display order.
var Items = []Item{
	{Product: pricing.Product{SKU: "CPU-N5", Name: "CPU Nexa 5 (6 คอร์)", Category: "CPU", Price: 6290}, Stock: 8, InBuilder: true,
		Specs: Specs{Socket: s("NX-1"), TDPW: i(65)}},
	{Product: pricing.Product{SKU: "CPU-N7", Name: "CPU Nexa 7 (8 คอร์)", Category: "CPU", Price: 10990}, Stock: 5, InBuilder: true,
		Specs: Specs{Socket: s("NX-2"), TDPW: i(125)}},
	{Product: pricing.Product{SKU: "MB-B6", Name: "เมนบอร์ด B6-Lite", Category: "MB", Price: 4590, RedTag: true}, Stock: 6, InBuilder: true,
		Specs: Specs{Socket: s("NX-1"), RAMType: s("DDR4"), FormFactor: s("mATX")}},
	{Product: pricing.Product{SKU: "MB-X7", Name: "เมนบอร์ด X7-Pro", Category: "MB", Price: 8790}, Stock: 3, InBuilder: true,
		Specs: Specs{Socket: s("NX-2"), RAMType: s("DDR5"), FormFactor: s("ATX")}},
	{Product: pricing.Product{SKU: "RAM-D4", Name: "แรม DDR4 16GB (2×8)", Category: "RAM", Price: 1290}, Stock: 10, OnHand: 11, InBuilder: true,
		Specs: Specs{RAMType: s("DDR4")}},
	{Product: pricing.Product{SKU: "RAM-16", Name: "แรม DDR5 16GB (2×8)", Category: "RAM", Price: 1890}, Stock: 20, InBuilder: true,
		Specs: Specs{RAMType: s("DDR5")}},
	{Product: pricing.Product{SKU: "RAM-32", Name: "แรม DDR5 32GB (2×16)", Category: "RAM", Price: 3490, RedTag: true}, Stock: 12, InBuilder: true,
		Specs: Specs{RAMType: s("DDR5")}},
	{Product: pricing.Product{SKU: "GPU-V46", Name: "การ์ดจอ Vexa 4600 8GB", Category: "GPU", Price: 11490, RedTag: true}, Stock: 4, InBuilder: true,
		Specs: Specs{TDPW: i(220), RecommendedPSUW: i(550), GPULengthMm: i(240)}},
	{Product: pricing.Product{SKU: "GPU-V57", Name: "การ์ดจอ Vexa 5700 12GB", Category: "GPU", Price: 23990}, Stock: 1, PerBuyerLimit: &one, InBuilder: true,
		Specs: Specs{TDPW: i(320), RecommendedPSUW: i(750), GPULengthMm: i(310)}},
	{Product: pricing.Product{SKU: "SSD-1T", Name: "SSD NVMe 1TB", Category: "SSD", Price: 2190, RedTag: true}, Stock: 15, InBuilder: true},
	{Product: pricing.Product{SKU: "PSU-550", Name: "พาวเวอร์ 550W Bronze", Category: "PSU", Price: 1990}, Stock: 6, InBuilder: true,
		Specs: Specs{PSUOutputW: i(550)}},
	{Product: pricing.Product{SKU: "PSU-750", Name: "พาวเวอร์ 750W Gold", Category: "PSU", Price: 3290}, Stock: 7, InBuilder: true,
		Specs: Specs{PSUOutputW: i(750)}},
	{Product: pricing.Product{SKU: "CASE-M", Name: "เคส Airflow M", Category: "CASE", Price: 1590}, Stock: 9, InBuilder: true,
		Specs: Specs{CaseSupports: []string{"mATX"}, CaseMaxGPUMm: i(300)}},
	{Product: pricing.Product{SKU: "CASE-L", Name: "เคส Tower L", Category: "CASE", Price: 2490}, Stock: 4, InBuilder: true,
		Specs: Specs{CaseSupports: []string{"ATX", "mATX"}, CaseMaxGPUMm: i(380)}},
	{Product: pricing.Product{SKU: "MON-27", Name: "จอ 27\" 165Hz", Category: "MON", Price: 7990}, Stock: 5, OnHand: 6},
}

func BySKU(sku string) (Item, bool) {
	for _, it := range Items {
		if it.SKU == sku {
			return it, true
		}
	}
	return Item{}, false
}

// P returns the pricing product for a SKU (panics on unknown; for seeds/tests).
func P(sku string) pricing.Product {
	it, ok := BySKU(sku)
	if !ok {
		panic("unknown sku " + sku)
	}
	return it.Product
}
