// Package clock is the web's notion of "now" (DESIGN.md T-03).
// In production it is real time. In tests it can be frozen or set to run from a given instant.
package clock

import (
	"sync"
	"time"
)

// TZ is Thai time (UTC+7). All business rules use it.
var TZ = time.FixedZone("ICT", 7*3600)

type Clock struct {
	mu      sync.RWMutex
	base    *time.Time // nil = real time
	setAt   time.Time
	running bool
}

func New() *Clock { return &Clock{} }

// Now returns the web's current time in Thai time.
func (c *Clock) Now() time.Time {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.base == nil {
		return time.Now().In(TZ)
	}
	if c.running {
		return c.base.Add(time.Since(c.setAt)).In(TZ)
	}
	return c.base.In(TZ)
}

// Set locks the clock at t. running=true lets it tick forward from t.
func (c *Clock) Set(t time.Time, running bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	tt := t
	c.base = &tt
	c.setAt = time.Now()
	c.running = running
}

// Running reports whether the clock ticks (real time counts as running).
func (c *Clock) Running() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.base == nil || c.running
}

// Format renders ISO 8601 with +07:00 (API-CONTRACT.md 1).
func Format(t time.Time) string { return t.In(TZ).Format(time.RFC3339) }

// Date builds a Thai-time instant.
func Date(y int, m time.Month, d, hh, mm, ss int) time.Time {
	return time.Date(y, m, d, hh, mm, ss, 0, TZ)
}
