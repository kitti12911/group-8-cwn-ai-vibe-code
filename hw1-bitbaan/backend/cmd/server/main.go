package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"bitbaan/backend/internal/api"
	"bitbaan/backend/internal/clock"
	"bitbaan/backend/internal/store"
)

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func main() {
	ctx := context.Background()
	dsn := env("DATABASE_URL", "postgres://bitbaan:bitbaan@localhost:5434/bitbaan?sslmode=disable")
	testMode := env("TEST_MODE", "0") == "1"
	bugMode, _ := strconv.Atoi(env("BUG_MODE", "0"))
	if bugMode < 0 || bugMode > 2 {
		bugMode = 0
	}

	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		log.Fatal(err)
	}
	cfg.MaxConns = 30
	var pool *pgxpool.Pool
	for i := 0; i < 30; i++ { // wait for the db container
		if pool, err = pgxpool.NewWithConfig(ctx, cfg); err == nil {
			if err = pool.Ping(ctx); err == nil {
				break
			}
			pool.Close()
		}
		log.Printf("waiting for database: %v", err)
		time.Sleep(time.Second)
	}
	if err != nil {
		log.Fatal(err)
	}

	s := &store.Store{Pool: pool, Clock: clock.New(), BugMode: bugMode}
	if testMode {
		s.Clock.Set(store.DefaultNow, false)
	}
	if !s.HasSchema(ctx) || env("RESET_ON_START", "0") == "1" {
		log.Print("initialising database with TEST-DATA.md seed")
		if err := s.Reset(ctx); err != nil {
			log.Fatal(err)
		}
	}

	// release expired holds and new lots every second (NFR-11)
	go func() {
		for range time.Tick(time.Second) {
			if err := s.Maintain(ctx); err != nil {
				log.Printf("maintain: %v", err)
			}
		}
	}()

	addr := ":" + env("PORT", "8080")
	log.Printf("bitbaan backend on %s · TEST_MODE=%v · BUG_MODE=%d", addr, testMode, bugMode)
	log.Fatal(http.ListenAndServe(addr, api.New(s, testMode)))
}
