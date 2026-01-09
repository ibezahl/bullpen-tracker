"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Pt = { x: number; y: number };

type Pitcher = {
  id: string;
  name: string;
  throwing_hand: "R" | "L" | null;
  created_at: string;
};

type SessionRow = {
  id: string;
  pitcher_id: string;
  session_date: string;
  label: string | null;
  notes: string | null;
  created_at: string;
};

type PitchRow = {
  id: string;
  user_id: string;
  pitcher_id: string;
  session_id: string;
  pitch_type: string;
  target_x: number;
  target_y: number;
  actual_x: number;
  actual_y: number;
  dx: number;
  dy: number;
  notes: string | null;
  created_at: string;
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function fmt(n: number) {
  return Number.isFinite(n) ? n.toFixed(3) : "—";
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export default function Home() {
  const supabaseReady = Boolean(supabase);

  // Auth
  const [session, setSession] = useState<any>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // Domain
  const [pitchType, setPitchType] = useState<string>("FB");
  const [notes, setNotes] = useState<string>("");

  // Filters and selection
  const [pitchTypeFilter, setPitchTypeFilter] = useState<string>("ALL");
  const [highlightPitchId, setHighlightPitchId] = useState<string | null>(null);

  const [pitchers, setPitchers] = useState<Pitcher[]>([]);
  const [pitchersLoading, setPitchersLoading] = useState(false);
  const [selectedPitcherId, setSelectedPitcherId] = useState<string>("");

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");

  const [newPitcherName, setNewPitcherName] = useState("");
  const [newPitcherHand, setNewPitcherHand] = useState<"R" | "L">("R");

  const [newSessionLabel, setNewSessionLabel] = useState("");
  const [newSessionDate, setNewSessionDate] = useState<string>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });

  // Strike zone
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const [target, setTarget] = useState<Pt | null>(null);
  const [actual, setActual] = useState<Pt | null>(null);

  // Bullpen: keep target toggle and pitches state
  const [keepTargetBetweenSaves, setKeepTargetBetweenSaves] = useState(true);

  const [pitches, setPitches] = useState<PitchRow[]>([]);
  const [pitchesLoading, setPitchesLoading] = useState(false);

  const filteredPitches = useMemo(() => {
    if (pitchTypeFilter === "ALL") return pitches;
    return pitches.filter((p) => p.pitch_type === pitchTypeFilter);
  }, [pitches, pitchTypeFilter]);

  const pitchNumberById = useMemo(() => {
    // True pitch number within the session, based on chronological order (oldest -> newest)
    const asc = [...pitches].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const map = new Map<string, number>();
    asc.forEach((p, idx) => map.set(p.id, idx + 1));
    return map;
  }, [pitches]);

  // Non-blocking save toast
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: "", visible: false });
  const toastTimerRef = useRef<number | null>(null);

  function showToast(message: string) {
    setToast({ message, visible: true });

    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = window.setTimeout(() => {
      setToast((t) => ({ ...t, visible: false }));
    }, 2500);
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const status = useMemo(() => {
    if (!target) return "Click once to set TARGET";
    if (!actual) return "Click again to set ACTUAL";
    return "Ready to save";
  }, [target, actual]);

  const deltas = useMemo(() => {
    if (!target || !actual) return null;
    const dx = actual.x - target.x;
    const dy = actual.y - target.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return { dx, dy, dist };
  }, [target, actual]);

  // Bullpen: session stats and pitch breakdown
  const sessionStats = useMemo(() => {
    if (!filteredPitches.length) return null;

    let sumDx = 0;
    let sumDy = 0;
    let sumDist = 0;
    let outOfZone = 0;

    for (const p of filteredPitches) {
      sumDx += p.dx;
      sumDy += p.dy;
      sumDist += Math.sqrt(p.dx * p.dx + p.dy * p.dy);

      // Strike zone is the centered box: [0.25, 0.75] in both axes
      if (p.actual_x < 0.25 || p.actual_x > 0.75 || p.actual_y < 0.25 || p.actual_y > 0.75) {
        outOfZone += 1;
      }
    }

    const n = filteredPitches.length;
    return {
      n,
      avgDx: sumDx / n,
      avgDy: sumDy / n,
      avgDist: sumDist / n,
      outOfZone,
      outOfZonePct: outOfZone / n,
    };
  }, [filteredPitches]);
  const availablePitchTypes = useMemo(() => {
    const set = new Set<string>();
    for (const p of pitches) set.add(p.pitch_type);
    return Array.from(set).sort();
  }, [pitches]);

  const pitchTypeBreakdown = useMemo(() => {
    if (!pitches.length) return [] as Array<{ pitch_type: string; n: number; avgDist: number; outOfZonePct: number }>;

    const groups = new Map<string, { n: number; sumDist: number; out: number }>();

    for (const p of pitches) {
      const g = groups.get(p.pitch_type) ?? { n: 0, sumDist: 0, out: 0 };
      g.n += 1;
      g.sumDist += Math.sqrt(p.dx * p.dx + p.dy * p.dy);
      if (p.actual_x < 0.25 || p.actual_x > 0.75 || p.actual_y < 0.25 || p.actual_y > 0.75) g.out += 1;
      groups.set(p.pitch_type, g);
    }

    return Array.from(groups.entries())
      .map(([pitch_type, g]) => ({
        pitch_type,
        n: g.n,
        avgDist: g.sumDist / g.n,
        outOfZonePct: g.out / g.n,
      }))
      .sort((a, b) => b.n - a.n);
  }, [pitches]);

  // Boot auth
  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error(error);
        return;
      }
      setSession(data.session ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      sub?.subscription.unsubscribe();
    };
  }, []);

  // Load pitchers when signed in
  useEffect(() => {
    if (!supabase || !session?.user?.id) return;

    const load = async () => {
      setPitchersLoading(true);
      try {
        const { data, error } = await supabase
          .from("pitchers")
          .select("id,name,throwing_hand,created_at")
          .order("created_at", { ascending: false });
        if (error) throw error;
        setPitchers((data ?? []) as Pitcher[]);

        if (!selectedPitcherId && (data?.length ?? 0) > 0) {
          setSelectedPitcherId((data as any)[0].id);
        }
      } catch (e: any) {
        console.error(e);
        alert(e?.message ?? "Failed to load pitchers");
      } finally {
        setPitchersLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  // Load sessions when pitcher changes
  useEffect(() => {
    if (!supabase || !session?.user?.id || !selectedPitcherId) {
      setSessions([]);
      setSelectedSessionId("");
      return;
    }

    const load = async () => {
      setSessionsLoading(true);
      try {
        const { data, error } = await supabase
          .from("sessions")
          .select("id,pitcher_id,session_date,label,notes,created_at")
          .eq("pitcher_id", selectedPitcherId)
          .order("session_date", { ascending: false })
          .order("created_at", { ascending: false });
        if (error) throw error;
        setSessions((data ?? []) as SessionRow[]);

        if ((data?.length ?? 0) > 0) {
          setSelectedSessionId((data as any)[0].id);
        } else {
          setSelectedSessionId("");
        }
      } catch (e: any) {
        console.error(e);
        alert(e?.message ?? "Failed to load sessions");
      } finally {
        setSessionsLoading(false);
      }
    };

    load();
  }, [selectedPitcherId, session?.user?.id]);

  // Load pitches when session changes
  useEffect(() => {
    if (!supabase || !session?.user?.id || !selectedSessionId) {
      setPitches([]);
      return;
    }
    setHighlightPitchId(null);
    const load = async () => {
      setPitchesLoading(true);
      try {
        const { data, error } = await supabase
          .from("pitches")
          .select(
            "id,user_id,pitcher_id,session_id,pitch_type,target_x,target_y,actual_x,actual_y,dx,dy,notes,created_at"
          )
          .eq("session_id", selectedSessionId)
          .order("created_at", { ascending: false })
          .limit(1000);
        if (error) throw error;
        setPitches((data ?? []) as PitchRow[]);
      } catch (e: any) {
        console.error(e);
        alert(e?.message ?? "Failed to load pitches");
      } finally {
        setPitchesLoading(false);
      }
    };

    load();
  }, [selectedSessionId, session?.user?.id]);

  // Undo last pitch (delete most recent pitch for session)
  async function undoLastPitch() {
    if (!supabase || !session?.user?.id || !selectedSessionId) return;
    if (!pitches.length) return;

    const last = pitches[0]; // pitches are ordered newest-first
    const ok = confirm(`Undo last pitch (${last.pitch_type})? This will delete it.`);
    if (!ok) return;

    try {
      const { error } = await supabase
        .from("pitches")
        .delete()
        .eq("id", last.id)
        .eq("user_id", session.user.id);

      if (error) throw error;

      setPitches((prev) => prev.filter((p) => p.id !== last.id));
      if (highlightPitchId === last.id) setHighlightPitchId(null);
      showToast(`Undid last pitch (${last.pitch_type})`);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to undo last pitch");
    }
  }

  async function signUp() {
    setAuthError(null);
    if (!supabase) {
      setAuthError("Supabase is not configured. Ensure app/.env.local has keys, then restart npm run dev.");
      return;
    }
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
      });
      if (error) throw error;
      alert("Signed up. If email confirmation is enabled, check your email.");
    } catch (e: any) {
      setAuthError(e?.message ?? "Sign up failed");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signIn() {
    setAuthError(null);
    if (!supabase) {
      setAuthError("Supabase is not configured. Ensure app/.env.local has keys, then restart npm run dev.");
      return;
    }
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      if (error) throw error;
    } catch (e: any) {
      setAuthError(e?.message ?? "Sign in failed");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    setAuthBusy(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setAuthBusy(false);
    }
  }

  async function createPitcher() {
    if (!supabase || !session?.user?.id) return;
    const name = newPitcherName.trim();
    if (!name) {
      alert("Enter a pitcher name.");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("pitchers")
        .insert({ user_id: session.user.id, name, throwing_hand: newPitcherHand })
        .select("id,name,throwing_hand,created_at")
        .single();
      if (error) throw error;

      const row = data as unknown as Pitcher;
      setPitchers((prev) => [row, ...prev]);
      setSelectedPitcherId(row.id);
      setNewPitcherName("");
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to create pitcher");
    }
  }

  async function createSession() {
    if (!supabase || !session?.user?.id) return;
    if (!selectedPitcherId) {
      alert("Select a pitcher first.");
      return;
    }
    const label = newSessionLabel.trim();

    try {
      const { data, error } = await supabase
        .from("sessions")
        .insert({
          user_id: session.user.id,
          pitcher_id: selectedPitcherId,
          session_date: newSessionDate,
          label: label || null,
        })
        .select("id,pitcher_id,session_date,label,notes,created_at")
        .single();
      if (error) throw error;

      const row = data as unknown as SessionRow;
      setSessions((prev) => [row, ...prev]);
      setSelectedSessionId(row.id);
      setNewSessionLabel("");
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to create session");
    }
  }

  function pointFromClick(e: React.MouseEvent<HTMLDivElement>): Pt | null {
    const el = zoneRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();

    // Normalized coordinates across the *entire* canvas.
    // We intentionally do NOT clamp so you can record misses outside the strike zone.
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  function onZoneClick(e: React.MouseEvent<HTMLDivElement>) {
    const pt = pointFromClick(e);
    if (!pt) return;

    if (!target) {
      setTarget(pt);
      setActual(null);
      return;
    }
    setActual(pt);
  }

  async function savePitch() {
    if (!supabase || !session?.user?.id) {
      alert("Please sign in first.");
      return;
    }
    if (!selectedPitcherId) {
      alert("Select a pitcher first.");
      return;
    }
    if (!selectedSessionId) {
      alert("Select or create a session first.");
      return;
    }
    if (!target || !actual) {
      alert("Set both target and actual before saving.");
      return;
    }

    const dx = actual.x - target.x;
    const dy = actual.y - target.y;

    try {
      const { data, error } = await supabase
        .from("pitches")
        .insert({
          user_id: session.user.id,
          pitcher_id: selectedPitcherId,
          session_id: selectedSessionId,
          pitch_type: pitchType,
          target_x: target.x,
          target_y: target.y,
          actual_x: actual.x,
          actual_y: actual.y,
          dx,
          dy,
          notes: notes || null,
        })
        .select(
          "id,user_id,pitcher_id,session_id,pitch_type,target_x,target_y,actual_x,actual_y,dx,dy,notes,created_at"
        )
        .single();
      if (error) throw error;

      // Update local list so the scatter plot updates immediately.
      if (data) setPitches((prev) => [data as PitchRow, ...prev]);

      // Bullpen workflow: clear ACTUAL after save, optionally keep TARGET.
      setActual(null);
      if (!keepTargetBetweenSaves) setTarget(null);

      const pitchNum = pitches.length + 1; // since we just prepended the new pitch
      showToast(`Saved pitch #${pitchNum} (${pitchType}) ✅`);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to save pitch");
    }
  }

  function resetZone() {
    setTarget(null);
    setActual(null);
  }

  // Clear all pitches for the currently selected session
  async function clearSessionPitches() {
    if (!supabase || !session?.user?.id || !selectedSessionId) return;

    const ok = confirm("Delete ALL pitches for this session? This cannot be undone.");
    if (!ok) return;

    try {
      const { error } = await supabase
        .from("pitches")
        .delete()
        .eq("session_id", selectedSessionId)
        .eq("user_id", session.user.id);

      if (error) throw error;

      setPitches([]);
      setTarget(null);
      setActual(null);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to clear session pitches");
    }
  }

  return (
    <main className="min-h-screen p-6 flex flex-col gap-6">
      {!supabaseReady && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Supabase is not configured yet. Ensure <span className="font-mono">app/.env.local</span> has{" "}
          <span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
          <span className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>, then restart{" "}
          <span className="font-mono">npm run dev</span>.
        </div>
      )}

      <div className="rounded-xl border bg-white p-4 shadow-sm flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-gray-700">
            {session ? (
              <>
                Signed in as <span className="font-medium">{session.user.email}</span>
              </>
            ) : (
              <>Not signed in</>
            )}
          </div>
          {session ? (
            <button onClick={signOut} className="px-3 py-2 rounded-lg border" disabled={authBusy}>
              Sign out
            </button>
          ) : null}
        </div>

        {!session && (
          <div className="grid gap-3 md:grid-cols-3 items-end">
            <div className="md:col-span-1">
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="you@email.com"
                type="email"
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-medium mb-1">Password</label>
              <input
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="password"
                type="password"
              />
            </div>
            <div className="md:col-span-1 flex gap-2">
              <button
                onClick={signIn}
                className="px-3 py-2 rounded-lg bg-black text-white"
                disabled={authBusy || !authEmail || !authPassword}
              >
                Sign in
              </button>
              <button
                onClick={signUp}
                className="px-3 py-2 rounded-lg border"
                disabled={authBusy || !authEmail || !authPassword}
              >
                Sign up
              </button>
            </div>
          </div>
        )}

        {authError && <div className="text-sm text-red-600">{authError}</div>}
      </div>

      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Bullpen Tracker</h1>
        <p className="text-gray-600">
          Select a pitcher and session. Click once to set the intended target, then click again to set the actual pitch
          location.
        </p>
      </header>

      {session && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold mb-3">Pitcher</h2>

            <label className="block text-sm font-medium mb-1">Select pitcher</label>
            <select
              value={selectedPitcherId}
              onChange={(e) => setSelectedPitcherId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 bg-white"
              disabled={pitchersLoading}
            >
              <option value="">{pitchersLoading ? "Loading…" : "Choose a pitcher"}</option>
              {pitchers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.throwing_hand ? ` (${p.throwing_hand})` : ""}
                </option>
              ))}
            </select>

            <div className="mt-4 grid gap-3 md:grid-cols-3 items-end">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Add pitcher</label>
                <input
                  value={newPitcherName}
                  onChange={(e) => setNewPitcherName(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Name"
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-sm font-medium mb-1">Throws</label>
                <select
                  value={newPitcherHand}
                  onChange={(e) => setNewPitcherHand(e.target.value as any)}
                  className="w-full border rounded-lg px-3 py-2 bg-white"
                >
                  <option value="R">R</option>
                  <option value="L">L</option>
                </select>
              </div>
              <div className="md:col-span-3">
                <button onClick={createPitcher} className="px-3 py-2 rounded-lg bg-black text-white">
                  Add pitcher
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold mb-3">Session</h2>

            <label className="block text-sm font-medium mb-1">Select session</label>
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 bg-white"
              disabled={!selectedPitcherId || sessionsLoading}
            >
              <option value="">
                {!selectedPitcherId ? "Select a pitcher first" : sessionsLoading ? "Loading…" : "Choose a session"}
              </option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.session_date}
                  {s.label ? ` — ${s.label}` : ""}
                </option>
              ))}
            </select>

            <div className="mt-4 grid gap-3 md:grid-cols-3 items-end">
              <div className="md:col-span-1">
                <label className="block text-sm font-medium mb-1">Date</label>
                <input
                  value={newSessionDate}
                  onChange={(e) => setNewSessionDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  type="date"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Label (optional)</label>
                <input
                  value={newSessionLabel}
                  onChange={(e) => setNewSessionLabel(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Example: Side work, Bullpen #3"
                />
              </div>
              <div className="md:col-span-3">
                <button
                  onClick={createSession}
                  className="px-3 py-2 rounded-lg bg-black text-white disabled:opacity-40"
                  disabled={!selectedPitcherId}
                >
                  Add session
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[420px_1fr] items-start">
        <section className="flex flex-col gap-3">
          <div className="text-sm text-gray-600">
            Status: <span className="font-medium">{status}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-600">Filter:</span>
            <button
              className={`px-2 py-1 rounded border ${pitchTypeFilter === "ALL" ? "bg-gray-900 text-white border-gray-900" : "bg-white"}`}
              onClick={() => setPitchTypeFilter("ALL")}
              type="button"
            >
              All
            </button>
            {availablePitchTypes.map((t) => (
              <button
                key={t}
                className={`px-2 py-1 rounded border ${pitchTypeFilter === t ? "bg-gray-900 text-white border-gray-900" : "bg-white"}`}
                onClick={() => setPitchTypeFilter(t)}
                type="button"
              >
                {t}
              </button>
            ))}
            <span className="ml-auto text-gray-500">
              Showing {filteredPitches.length} of {pitches.length}
            </span>
          </div>

          <div
            ref={zoneRef}
            onClick={onZoneClick}
            className="relative aspect-[3/4] w-full max-w-[420px] border rounded-xl bg-white shadow-sm select-none"
            role="button"
            aria-label="Pitch location canvas"
          >
            {/*
              Expanded canvas: the strike zone is the centered box.
              Strike zone spans x,y in [0.25, 0.75].
              Anything outside that range is still recordable (misses off the plate, high, in the dirt).
            */}

            {/* Strike zone background + border */}
            <div
              className="absolute rounded-md border-2 border-gray-800 bg-gray-50"
              style={{ left: "25%", top: "25%", width: "50%", height: "50%" }}
            />

            {/* 3x3 grid lines INSIDE the strike zone only */}
            <div
              className="absolute grid grid-cols-3 grid-rows-3"
              style={{ left: "25%", top: "25%", width: "50%", height: "50%" }}
            >
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="border border-gray-200" />
              ))}
            </div>

            {/* Subtle center crosshair to help visual orientation */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-100" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-gray-100" />

            {/* Session scatter: previous ACTUAL locations for the selected session (respects filter) */}
            {filteredPitches.length > 0 && (
              <>
                {filteredPitches.slice(0, 300).map((p) => {
                  const isHi = p.id === highlightPitchId;
                  return (
                    <div
                      key={p.id}
                      className={
                        isHi
                          ? "absolute h-3 w-3 rounded-full bg-gray-700/80 ring-2 ring-white"
                          : "absolute h-2 w-2 rounded-full bg-gray-300/50"
                      }
                      style={{
                        left: `calc(${p.actual_x * 100}% - ${isHi ? 6 : 4}px)`,
                        top: `calc(${p.actual_y * 100}% - ${isHi ? 6 : 4}px)`,
                        zIndex: isHi ? 2 : 1,
                      }}
                      title={`${p.pitch_type} | dx ${p.dx.toFixed(3)}, dy ${p.dy.toFixed(3)}`}
                    />
                  );
                })}
              </>
            )}

            {target && (
              <div
                className="absolute h-4 w-4 rounded-full bg-blue-600 shadow ring-2 ring-white"
                style={{
                  left: `calc(${target.x * 100}% - 8px)`,
                  top: `calc(${target.y * 100}% - 8px)`,
                  zIndex: 3,
                }}
              />
            )}
            {actual && (
              <div
                className="absolute h-4 w-4 rounded-full bg-red-600 shadow ring-2 ring-white"
                style={{
                  left: `calc(${actual.x * 100}% - 8px)`,
                  top: `calc(${actual.y * 100}% - 8px)`,
                  zIndex: 3,
                }}
              />
            )}

            <div className="absolute bottom-3 left-3 text-xs text-gray-600 bg-white/90 backdrop-blur px-2 py-1 rounded-md border">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full bg-blue-600" /> Target
                <span className="inline-block h-3 w-3 rounded-full bg-red-600 ml-3" /> Actual
              </div>
              <div className="mt-1">Strike zone is the centered box, misses outside are allowed.</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={savePitch}
              className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-40"
              disabled={!session || !selectedPitcherId || !selectedSessionId || !target || !actual}
            >
              Save pitch
            </button>

            <button
              onClick={() => setActual(null)}
              className="px-4 py-2 rounded-lg border"
              disabled={!actual}
              title="Clear the actual dot"
            >
              Clear actual
            </button>

            <button
              onClick={() => {
                setTarget(null);
                setActual(null);
              }}
              className="px-4 py-2 rounded-lg border"
              title="Change the target"
            >
              Change target
            </button>

            <button onClick={resetZone} className="px-4 py-2 rounded-lg border" title="Clear target and actual">
              Reset
            </button>

            <button
              onClick={clearSessionPitches}
              className="px-4 py-2 rounded-lg border text-red-600 border-red-300"
              disabled={!selectedSessionId || pitches.length === 0}
              title="Delete all pitches in this session"
            >
              Clear session pitches
            </button>

            <label className="ml-2 inline-flex items-center gap-2 text-sm text-gray-700 select-none">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={keepTargetBetweenSaves}
                onChange={(e) => setKeepTargetBetweenSaves(e.target.checked)}
              />
              Keep target after save
            </label>
          </div>

          <div className="text-sm text-gray-700 space-y-1">
            <div>
              Target: <span className="font-mono">{target ? `${fmt(target.x)}, ${fmt(target.y)}` : "—"}</span>
            </div>
            <div>
              Actual: <span className="font-mono">{actual ? `${fmt(actual.x)}, ${fmt(actual.y)}` : "—"}</span>
            </div>
            <div>
              Miss (dx, dy): <span className="font-mono">{deltas ? `${fmt(deltas.dx)}, ${fmt(deltas.dy)}` : "—"}</span>
            </div>
            <div>
              Miss distance: <span className="font-mono">{deltas ? fmt(deltas.dist) : "—"}</span>
            </div>
            {/* Save toast (inline) */}
            <div
              className={`transition-all ${
                toast.visible ? "opacity-100 max-h-20" : "opacity-0 max-h-0"
              } overflow-hidden`}
              aria-live="polite"
              aria-atomic="true"
            >
              <div className="mt-2 inline-flex items-center rounded-md border bg-white px-3 py-2 text-xs text-gray-700">
                {toast.message}
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4 max-w-xl">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Recent pitches</h2>
              <button
                onClick={undoLastPitch}
                className="px-3 py-2 rounded-lg border"
                disabled={!pitches.length}
                title="Delete the most recent pitch"
              >
                Undo last
              </button>
            </div>

            {!selectedSessionId ? (
              <div className="text-sm text-gray-600">Select a session to see pitches.</div>
            ) : pitchesLoading ? (
              <div className="text-sm text-gray-600">Loading…</div>
            ) : !pitches.length ? (
              <div className="text-sm text-gray-600">No pitches yet.</div>
            ) : !filteredPitches.length ? (
              <div className="text-sm text-gray-600">No pitches match this filter.</div>
            ) : (
              <div className="divide-y rounded-lg border">
                {filteredPitches.slice(0, 20).map((p) => {
                  const isHi = p.id === highlightPitchId;
                  const out =
                    p.actual_x < 0.25 || p.actual_x > 0.75 || p.actual_y < 0.25 || p.actual_y > 0.75;
                  const pitchNum = pitchNumberById.get(p.id);

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setHighlightPitchId((cur) => (cur === p.id ? null : p.id))}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-3 ${
                        isHi ? "bg-gray-50" : "bg-white"
                      }`}
                      title="Click to highlight on plot"
                    >
                      <div className="flex items-center gap-3">
                        <div className="font-mono text-gray-500">#{pitchNum ?? "?"}</div>
                        <div className="font-medium">{p.pitch_type}</div>
                        <div className="text-gray-600 font-mono">
                          dx {p.dx.toFixed(3)}, dy {p.dy.toFixed(3)}
                        </div>
                      </div>
                      <div
                        className={`text-xs px-2 py-1 rounded border ${
                          out ? "text-red-700 border-red-200" : "text-green-700 border-green-200"
                        }`}
                      >
                        {out ? "Out" : "In"}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-2 text-xs text-gray-500">Click a row to highlight that pitch on the plot.</div>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold mb-3">Pitch details</h2>

            <label className="block text-sm font-medium mb-1">Pitch type</label>
            <select
              value={pitchType}
              onChange={(e) => setPitchType(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 bg-white"
            >
              <option value="FB">Fastball (FB)</option>
              <option value="SL">Slider (SL)</option>
              <option value="CB">Curveball (CB)</option>
              <option value="CH">Changeup (CH)</option>
              <option value="CT">Cutter (CT)</option>
              <option value="SI">Sinker (SI)</option>
              <option value="OT">Other</option>
            </select>

            <label className="block text-sm font-medium mt-4 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 bg-white min-h-[100px]"
              placeholder="Example: working glove-side, missed arm-side today"
            />
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold mb-3">Session summary</h2>

            {!selectedSessionId ? (
              <div className="text-sm text-gray-600">Select or create a session to see stats.</div>
            ) : pitchesLoading ? (
              <div className="text-sm text-gray-600">Loading pitches…</div>
            ) : !sessionStats ? (
              <div className="text-sm text-gray-600">No pitches saved yet for this session.</div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border p-3">
                    <div className="text-gray-500">Pitches</div>
                    <div className="text-xl font-semibold">{sessionStats.n}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-gray-500">Avg miss distance</div>
                    <div className="text-xl font-semibold">{sessionStats.avgDist.toFixed(3)}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-gray-500">Avg dx</div>
                    <div className="text-xl font-semibold">{sessionStats.avgDx.toFixed(3)}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-gray-500">Avg dy</div>
                    <div className="text-xl font-semibold">{sessionStats.avgDy.toFixed(3)}</div>
                  </div>
                </div>

                <div className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Out of zone</span>
                    <span className="font-medium">
                      {sessionStats.outOfZone} ({Math.round(sessionStats.outOfZonePct * 100)}%)
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full rounded bg-gray-100 overflow-hidden">
                    <div
                      className="h-full bg-gray-800"
                      style={{ width: `${Math.min(100, Math.max(0, sessionStats.outOfZonePct * 100))}%` }}
                    />
                  </div>
                </div>

                {pitchTypeBreakdown.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-2">By pitch type</div>
                    <div className="divide-y rounded-lg border">
                      {pitchTypeBreakdown.map((row) => (
                        <div key={row.pitch_type} className="flex items-center justify-between px-3 py-2 text-sm">
                          <div className="font-medium">{row.pitch_type}</div>
                          <div className="text-gray-600">{row.n} pitches</div>
                          <div className="text-gray-600">avg {row.avgDist.toFixed(3)}</div>
                          <div className="text-gray-600">{Math.round(row.outOfZonePct * 100)}% O-Z</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      Zone is the centered box: actual_x/y outside 0.25–0.75 counts as out of zone.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}