import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, isApiError } from './api';
import type { Me, TimeInfo } from './types';

// ---------------------------------------------------------------------------
// Server clock (NFR-16): every countdown uses the web server's time, never the
// device clock. offset = serverNow − Date.now(). In TEST_MODE the server clock
// may be frozen (`running: false`); then the page freezes too.
// ---------------------------------------------------------------------------

const clock = { offset: 0, frozenAt: null as number | null, testMode: false };

/** Current server time in ms. Usable outside React. */
export function serverNow(): number {
  return clock.frozenAt ?? Date.now() + clock.offset;
}

type Flash = TimeInfo['flash'];

interface ClockCtx {
  ready: boolean;
  /** bumps after every successful sync */
  version: number;
  flash: Flash | null;
  /** flash sale is running right now (by server time) */
  flashActive: boolean;
  sync: () => void;
}

const ClockContext = createContext<ClockCtx>({ ready: false, version: 0, flash: null, flashActive: false, sync: () => {} });

function computeFlashActive(flash: Flash | null, now: number): boolean {
  if (!flash) return false;
  if (flash.active) return flash.endsAt ? now < Date.parse(flash.endsAt) : true;
  return flash.nextStart ? now >= Date.parse(flash.nextStart) : false;
}

export function ClockProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [flashActive, setFlashActive] = useState(false);
  const flashRef = useRef<Flash | null>(null);
  const activeRef = useRef(false);
  const syncing = useRef(false);
  const lastSync = useRef(0);

  const sync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const t0 = Date.now();
      const info = await api.time();
      const t1 = Date.now();
      const server = Date.parse(info.now);
      if (!Number.isNaN(server)) {
        // assume the server stamped the response halfway through the round-trip
        clock.offset = server - (t0 + t1) / 2;
        clock.frozenAt = null;
        if (clock.testMode) {
          try {
            const tc = await api.testClock();
            if (tc.running === false) clock.frozenAt = Date.parse(tc.now) || server;
          } catch {
            /* not in test mode after all */
          }
        }
      }
      flashRef.current = info.flash ?? null;
      setFlash(info.flash ?? null);
      activeRef.current = computeFlashActive(info.flash ?? null, serverNow());
      setFlashActive(activeRef.current);
      setReady(true);
      setVersion((v) => v + 1);
      lastSync.current = Date.now();
    } catch {
      setReady(true);
    } finally {
      syncing.current = false;
    }
  }, []);

  // initial: detect test mode (bug-mode endpoint) then sync
  useEffect(() => {
    let alive = true;
    api
      .bugMode()
      .then((r) => {
        // on <html> (course template) and <body> (our tests)
        document.documentElement.dataset.bugMode = document.body.dataset.bugMode = String(r?.bugMode ?? 0);
        clock.testMode = true;
      })
      .catch(() => {
        document.documentElement.dataset.bugMode = document.body.dataset.bugMode = '0';
      })
      .finally(() => {
        // data-ready="true" once bug mode and the server clock are known — wait for it before clicking
        if (alive) void Promise.resolve(sync()).finally(() => (document.documentElement.dataset.ready = 'true'));
      });
    const id = window.setInterval(() => void sync(), 15000);
    const onFocus = () => {
      if (Date.now() - lastSync.current > 2000) void sync();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [sync]);

  // watch flash boundaries every second; resync when the state flips
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = computeFlashActive(flashRef.current, serverNow());
      if (next !== activeRef.current) {
        activeRef.current = next;
        setFlashActive(next);
        void sync();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [sync]);

  const value = useMemo<ClockCtx>(
    () => ({
      ready,
      version,
      flash,
      flashActive,
      sync: () => {
        if (Date.now() - lastSync.current > 1500) void sync();
      },
    }),
    [ready, version, flash, flashActive, sync],
  );
  return <ClockContext.Provider value={value}>{children}</ClockContext.Provider>;
}

export function useClock(): ClockCtx {
  return useContext(ClockContext);
}

/** Server time that re-renders every `tickMs`. */
export function useServerNow(tickMs = 1000): number {
  const { version } = useClock();
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setNow(serverNow());
    const id = window.setInterval(() => setNow(serverNow()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs, version]);
  return now;
}

// ---------------------------------------------------------------------------
// Auth: GET /api/me · 401 = guest
// ---------------------------------------------------------------------------

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<Me | null>;
  setMe: (m: Me | null) => void;
}

const AuthContext = createContext<AuthCtx>({
  me: null,
  loading: true,
  refresh: async () => null,
  setMe: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const m = await api.me();
      setMe(m);
      return m;
    } catch (e) {
      if (isApiError(e) && (e.status === 401 || e.status === 403)) setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ me, loading, refresh, setMe }), [me, loading, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthCtx {
  return useContext(AuthContext);
}

export function isStaff(me: Me | null): boolean {
  return !!me && (me.role === 'staff' || me.role === 'owner');
}

export function isBusiness(me: Me | null): boolean {
  return !!me && (me.tier === 'BUSINESS' || !!me.taxId);
}
