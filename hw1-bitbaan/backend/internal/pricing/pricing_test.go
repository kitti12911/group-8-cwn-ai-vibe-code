package pricing_test

import (
	"testing"
	"time"

	"bitbaan/backend/internal/catalog"
	"bitbaan/backend/internal/clock"
	. "bitbaan/backend/internal/pricing"
)

var (
	thu1000 = clock.Date(2026, time.November, 12, 10, 0, 0)
	fri1000 = clock.Date(2026, time.November, 13, 10, 0, 0)
	fri1230 = clock.Date(2026, time.November, 13, 12, 30, 0)
	fri6Nov = clock.Date(2026, time.November, 6, 12, 30, 0)
	fri6Eve = clock.Date(2026, time.November, 6, 18, 22, 0)
)

var expired2025 = clock.Date(2025, time.December, 31, 23, 59, 59)

var coupons = map[string]*Coupon{
	"NEWBIT200": {Code: "NEWBIT200", Kind: "fixed", Value: 200, MinAmount: 2000, FirstOrderOnly: true, LoginRequired: true},
	"GAMER5":    {Code: "GAMER5", Kind: "percent", Value: 5, MaxDiscount: 1000, Categories: []string{"GPU", "MON"}},
	"OLD2025":   {Code: "OLD2025", Kind: "fixed", Value: 300, ExpiresAt: &expired2025},
}

func lines(pairs ...any) []Line {
	var out []Line
	for i := 0; i < len(pairs); i += 2 {
		out = append(out, Line{Product: catalog.P(pairs[i].(string)), Qty: pairs[i+1].(int)})
	}
	return out
}

var full = lines("CPU-N5", 1, "MB-B6", 1, "RAM-D4", 1, "GPU-V46", 1, "SSD-1T", 1, "PSU-550", 1, "CASE-M", 1)
var six = lines("CPU-N5", 1, "MB-B6", 1, "RAM-D4", 1, "SSD-1T", 1, "PSU-550", 1, "CASE-M", 1)

type tc struct {
	id       string
	lines    []Line
	now      time.Time
	tier     Tier
	first    bool
	coupon   string
	shipping string
	assembly bool
	total    int64
	vat      int64 // satang
}

// TEST-DATA.md section 5 (hand-calculated before the web existed, verified by an independent subagent).
var table = []tc{
	{"Q01", lines("SSD-1T", 1), fri1000, TierNone, false, "", "standard", false, 2250, 14720},
	{"Q02", lines("CPU-N5", 1), thu1000, TierGeneral, true, "NEWBIT200", "standard", false, 6090, 39841},
	{"Q03", lines("CPU-N5", 1, "MB-B6", 1), fri1230, TierSilver, false, "", "standard", false, 9624, 62961},
	{"Q04", lines("CPU-N5", 1, "MB-B6", 1), thu1000, TierSilver, false, "", "standard", false, 10069, 65872},
	{"Q05", lines("MB-B6", 1), clock.Date(2026, 11, 13, 12, 59, 59), TierSilver, false, "", "standard", false, 4008, 26221},
	{"Q06", lines("MB-B6", 1), clock.Date(2026, 11, 13, 13, 0, 0), TierSilver, false, "", "standard", false, 4453, 29132},
	{"Q07", lines("GPU-V46", 1), fri1230, TierGold, false, "GAMER5", "standard", false, 9333, 61057},
	{"Q08", lines("GPU-V57", 1, "PSU-750", 1), thu1000, TierGold, false, "GAMER5", "standard", false, 24916, 163002},
	{"Q09", lines("MON-27", 5), fri1000, TierBusiness, false, "GAMER5", "standard", false, 35754, 233905},
	{"Q10", lines("MON-27", 10), fri1000, TierBusiness, false, "GAMER5", "standard", false, 72508, 474351},
	{"Q11", lines("CPU-N5", 5, "MB-B6", 5, "RAM-D4", 5), thu1000, TierBusiness, false, "", "standard", false, 53682, 351191},
	{"Q12", lines("RAM-16", 1), thu1000, TierNone, false, "", "express", false, 2040, 13346},
	{"Q13", lines("RAM-32", 1), thu1000, TierGeneral, false, "", "standard", false, 3490, 22832},
	{"Q14", full, thu1000, TierGeneral, true, "NEWBIT200", "standard", true, 28730, 187953},
	{"Q15", six, thu1000, TierGeneral, true, "NEWBIT200", "standard", true, 17740, 116056},
	{"Q16", full, fri1230, TierGold, false, "", "standard", true, 25748, 168445},
	{"Q17", lines("CPU-N7", 1, "MB-X7", 1), thu1000, TierNone, false, "", "pickup", false, 19280, 126131},
	{"Q18", lines("RAM-D4", 1, "SSD-1T", 1), fri1230, TierBusiness, false, "", "standard", false, 3001, 19633},
	{"Q19", lines("RAM-16", 1), thu1000, TierGeneral, true, "NEWBIT200", "standard", false, 1950, 12757},
	{"Q20", lines("CPU-N5", 1), thu1000, TierSilver, false, "NEWBIT200", "standard", false, 6102, 39920},
	{"Q21", lines("SSD-1T", 1), thu1000, TierBusiness, false, "", "standard", false, 2075, 13575},
	{"Q22", lines("GPU-V46", 1, "CPU-N5", 1), thu1000, TierGold, false, "GAMER5", "standard", false, 16346, 106936},
	{"Q23", lines("CPU-N5", 2, "MB-B6", 1), thu1000, TierGeneral, false, "", "standard", false, 16670, 109056},
	{"Q24", lines("GPU-V46", 1), fri1230, TierNone, false, "GAMER5", "standard", false, 9824, 64269},
	{"Q25", lines("SSD-1T", 1), thu1000, TierGeneral, true, "NEWBIT200", "standard", false, 2050, 13411},
	{"Q26", lines("CPU-N5", 1, "MB-B6", 1), fri1230, TierSilver, false, "", "express", false, 9774, 63942},
	{"Q27", lines("CPU-N5", 1, "MB-B6", 1, "MON-27", 1), fri6Eve, TierSilver, false, "GAMER5", "standard", false, 17432, 114041},
	{"B1101", lines("GPU-V46", 1), fri6Nov, TierGold, false, "GAMER5", "express", false, 9483, 62038},
}

func TestQuotesFromTestData(t *testing.T) {
	for _, c := range table {
		in := Input{Lines: c.lines, Tier: c.tier, LoggedIn: c.tier != TierNone, FirstOrder: c.first,
			CouponCode: c.coupon, Coupon: coupons[c.coupon], Shipping: c.shipping, Assembly: c.assembly, Now: c.now}
		q := Compute(in)
		if q.Total != c.total || q.VATSatang != c.vat {
			t.Errorf("%s: total %d vat %d, want %d / %d (quote %+v)", c.id, q.Total, q.VATSatang, c.total, c.vat, q)
		}
		if q.G1 != q.ListTotal-q.FlashDiscount || q.G2 != q.G1-q.BundleDiscount || q.G3 != q.G2-q.MemberDiscount ||
			q.G4 != q.G3-q.Coupon.Amount || q.Total != q.G4+q.AssemblyFee+q.ShippingFee || q.PreVATSatang+q.VATSatang != q.Total*100 {
			t.Errorf("%s: breakdown does not add up: %+v", c.id, q)
		}
	}
}

func TestFlashBoundaries(t *testing.T) { // E14–E20
	cases := []struct {
		at   time.Time
		want bool
	}{
		{clock.Date(2026, 11, 13, 11, 59, 59), false},
		{clock.Date(2026, 11, 13, 12, 0, 0), true},
		{clock.Date(2026, 11, 13, 12, 59, 59), true},
		{clock.Date(2026, 11, 13, 13, 0, 0), false},
		{clock.Date(2026, 11, 12, 12, 30, 0), false},
		{clock.Date(2026, 11, 14, 12, 30, 0), false},
	}
	for _, c := range cases {
		if got := FlashActive(c.at, 0); got != c.want {
			t.Errorf("FlashActive(%s) = %v", c.at, got)
		}
	}
}

func TestUnitBoundaries(t *testing.T) {
	// E33–E35 member rounding
	for _, c := range []struct{ g2, want int64 }{{3333, 99}, {3300, 99}, {3334, 100}} {
		if got := c.g2 * TierSilver.Rate() / 100; got != c.want {
			t.Errorf("silver on %d = %d want %d", c.g2, got, c.want)
		}
	}
	// E138 VAT of ฿1
	if v := VATSatang(1); v != 7 {
		t.Errorf("VAT(1) = %d", v)
	}
	// E01–E06 tiers
	for _, c := range []struct {
		spend int64
		want  Tier
	}{{19999, TierGeneral}, {20000, TierSilver}, {20001, TierSilver}, {99999, TierSilver}, {100000, TierGold}, {100001, TierGold}} {
		if got := TierFor(c.spend, false); got != c.want {
			t.Errorf("TierFor(%d) = %s", c.spend, got)
		}
	}
	// E61–E62 OLD2025
	before := Compute(Input{Lines: lines("SSD-1T", 1), CouponCode: "OLD2025", Coupon: coupons["OLD2025"], Now: expired2025})
	after := Compute(Input{Lines: lines("SSD-1T", 1), CouponCode: "OLD2025", Coupon: coupons["OLD2025"], Now: expired2025.Add(time.Second)})
	if before.Coupon.Status != "APPLIED" || after.Coupon.Status != "REJECTED" {
		t.Errorf("OLD2025 boundary: %s / %s", before.Coupon.Status, after.Coupon.Status)
	}
	// E42 deterministic
	in := Input{Lines: full, Tier: TierGold, Now: fri1230, Assembly: true, Shipping: "standard"}
	first := Compute(in).Total
	for i := 0; i < 1000; i++ {
		if Compute(in).Total != first {
			t.Fatal("not deterministic")
		}
	}
}
