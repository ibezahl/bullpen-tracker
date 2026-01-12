"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AccountBar from "@/components/AccountBar";
import { StrikeZoneGrid } from "@/components/StrikeZoneGrid";
import { supabase } from "@/lib/supabaseClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildZones5x5, type ZoneId, isZoneId } from "@/lib/strikeZone";

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
  tag: string | null;
  intended_location_zone_id: string | null;
  actual_location_zone_id: string | null;
  target_x: number;
  target_y: number;
  actual_x: number;
  actual_y: number;
  dx: number;
  dy: number;
  notes: string | null;
  created_at: string;
};

function fmt(n: number) {
  return Number.isFinite(n) ? n.toFixed(3) : "—";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return "Unknown error";
}

type Hand = "R" | "L";

function toHand(value: string): Hand {
  return value === "L" ? "L" : "R";
}

const DEFAULT_PITCH_TYPE = "FB";
const zones5x5 = buildZones5x5();
const zoneById = new Map(zones5x5.map((zone) => [zone.id, zone]));
const STORAGE_PITCHER_KEY = "bullpen:selectedPitcherId";
const STORAGE_SESSION_KEY = "bullpen:selectedSessionId";

function zoneIdToPoint(zoneId: ZoneId): Pt {
  const zone = zoneById.get(zoneId);
  if (!zone) return { x: 0.5, y: 0.5 };

  // Zones are expected to be built as a 5x5 grid. Some implementations use r5/c5,
  // others use row/col. Support both to avoid runtime/TS issues.
  const c = "c5" in (zone as any) ? (zone as any).c5 : (zone as any).col;
  const r = "r5" in (zone as any) ? (zone as any).r5 : (zone as any).row;

  return {
    x: (c + 0.5) / 5,
    y: (r + 0.5) / 5,
  };
}

function HomeClient() {
  const supabaseReady = Boolean(supabase);
  const searchParams = useSearchParams();

  // Auth
  const [session, setSession] = useState<Session | null>(null);
  // Domain
  const [pitchType, setPitchType] = useState<string>(DEFAULT_PITCH_TYPE);
  const [notes, setNotes] = useState<string>("");
  const [tag, setTag] = useState<string>("");

  // Filters and selection
  const [pitchTypeFilter, setPitchTypeFilter] = useState<string>("ALL");
  const [highlightPitchId, setHighlightPitchId] = useState<string | null>(null);

  const [pitchers, setPitchers] = useState<Pitcher[]>([]);
  const [pitchersLoading, setPitchersLoading] = useState(false);
  const [selectedPitcherId, setSelectedPitcherId] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);

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
  const [sessionDateUnlocked, setSessionDateUnlocked] = useState(false);

  // Strike zone
  const [intendedZoneId, setIntendedZoneId] = useState<ZoneId | null>(null);
  const [actualZoneId, setActualZoneId] = useState<ZoneId | null>(null);
  const [editingPitchId, setEditingPitchId] = useState<string | null>(null);
  const [activeGrid, setActiveGrid] = useState<"actual" | "intended">("actual");

  // Bullpen: keep intended toggle and pitches state
  const [keepIntendedBetweenSaves, setKeepIntendedBetweenSaves] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [pitches, setPitches] = useState<PitchRow[]>([]);
  const [pitchesLoading, setPitchesLoading] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [linkTimestampSeconds, setLinkTimestampSeconds] = useState<number | null>(null);
  const [linkSessionId, setLinkSessionId] = useState<string | null>(null);

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
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function resetPitchForm() {
    setPitchType(DEFAULT_PITCH_TYPE);
    setNotes("");
    setTag("");
    setIntendedZoneId(null);
    setActualZoneId(null);
  }

  function showToast(message: string) {
    setToast({ message, visible: true });

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = setTimeout(() => {
      setToast((t) => ({ ...t, visible: false }));
    }, 2500);
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedPitcherId = window.localStorage.getItem(STORAGE_PITCHER_KEY) ?? "";
    const storedSessionId = window.localStorage.getItem(STORAGE_SESSION_KEY) ?? "";
    if (storedPitcherId) setSelectedPitcherId(storedPitcherId);
    if (storedSessionId) setSelectedSessionId(storedSessionId);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    if (selectedPitcherId) {
      window.localStorage.setItem(STORAGE_PITCHER_KEY, selectedPitcherId);
    } else {
      window.localStorage.removeItem(STORAGE_PITCHER_KEY);
    }
  }, [hydrated, selectedPitcherId]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    if (selectedSessionId) {
      window.localStorage.setItem(STORAGE_SESSION_KEY, selectedSessionId);
    } else {
      window.localStorage.removeItem(STORAGE_SESSION_KEY);
    }
  }, [hydrated, selectedSessionId]);

  useEffect(() => {
    const sessionParam = searchParams.get("sessionId");
    const eventParam = searchParams.get("eventId");
    const timestampParam = searchParams.get("timestamp");
    if (sessionParam) setPendingSessionId(sessionParam);
    if (sessionParam) setLinkSessionId(sessionParam);
    if (eventParam) setCurrentEventId(eventParam);
    if (timestampParam) {
      const parsed = Number(timestampParam);
      setLinkTimestampSeconds(Number.isFinite(parsed) ? parsed : null);
    }
  }, [searchParams]);

  const status = useMemo(() => {
    if (editingPitchId) return "Editing pitch";
    if (!intendedZoneId) return "Select intended zone";
    if (!actualZoneId) return "Select actual zone";
    return "Ready to save";
  }, [editingPitchId, intendedZoneId, actualZoneId]);
  const isEditing = Boolean(editingPitchId);
  const editingPitchNumber = useMemo(() => {
    if (!editingPitchId) return null;
    return pitchNumberById.get(editingPitchId) ?? null;
  }, [editingPitchId, pitchNumberById]);

  const intendedPoint = useMemo(() => {
    return intendedZoneId ? zoneIdToPoint(intendedZoneId) : null;
  }, [intendedZoneId]);

  const actualPoint = useMemo(() => {
    return actualZoneId ? zoneIdToPoint(actualZoneId) : null;
  }, [actualZoneId]);

  const deltas = useMemo(() => {
    if (!intendedPoint || !actualPoint) return null;
    const dx = actualPoint.x - intendedPoint.x;
    const dy = actualPoint.y - intendedPoint.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return { dx, dy, dist };
  }, [intendedPoint, actualPoint]);

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
          setSelectedPitcherId(data[0].id);
        }
      } catch (e: unknown) {
        console.error(e);
        alert(getErrorMessage(e) || "Failed to load pitchers");
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
      setSessionsLoading(false);
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
          setSelectedSessionId((current) => {
            const hasSelected = Boolean(current) && data?.some((row) => row.id === current);
            return hasSelected ? current : data[0].id;
          });
        } else {
          setSelectedSessionId("");
        }
      } catch (e: unknown) {
        console.error(e);
        alert(getErrorMessage(e) || "Failed to load sessions");
      } finally {
        setSessionsLoading(false);
      }
    };

    load();
  }, [selectedPitcherId, session?.user?.id]);

  useEffect(() => {
    if (selectedSessionId) {
      setSessionDateUnlocked(false);
    }
  }, [selectedSessionId]);

  useEffect(() => {
    if (!supabase || !session?.user?.id || !pendingSessionId) return;

    const loadPitcherForSession = async () => {
      try {
        const { data, error } = await supabase
          .from("sessions")
          .select("id,pitcher_id")
          .eq("id", pendingSessionId)
          .single();
        if (error) throw error;
        if (data?.pitcher_id) {
          setSelectedPitcherId(data.pitcher_id);
        }
      } catch (e) {
        console.error(e);
      }
    };

    loadPitcherForSession();
  }, [pendingSessionId, session?.user?.id]);

  // Load pitches when session changes
  useEffect(() => {
    if (!supabase || !session?.user?.id || !selectedSessionId) {
      setPitches([]);
      setPitchesLoading(false);
      return;
    }
    setHighlightPitchId(null);
    const load = async () => {
      setPitchesLoading(true);
      try {
        const { data, error } = await supabase
          .from("pitches")
          .select(
            "id,user_id,pitcher_id,session_id,pitch_type,tag,intended_location_zone_id,actual_location_zone_id,target_x,target_y,actual_x,actual_y,dx,dy,notes,created_at"
          )
          .eq("session_id", selectedSessionId)
          .order("created_at", { ascending: false })
          .limit(1000);
        if (error) throw error;
        setPitches((data ?? []) as PitchRow[]);
      } catch (e: unknown) {
        console.error(e);
        alert(getErrorMessage(e) || "Failed to load pitches");
      } finally {
        setPitchesLoading(false);
      }
    };

    load();
  }, [selectedSessionId, session?.user?.id]);

  useEffect(() => {
    if (!pendingSessionId) return;
    if (!sessions.length) return;
    const exists = sessions.some((s) => s.id === pendingSessionId);
    if (exists) {
      setSelectedSessionId(pendingSessionId);
      setPendingSessionId(null);
    }
  }, [pendingSessionId, sessions]);

  function formatLinkTimestamp(seconds: number | null) {
    if (seconds === null || !Number.isFinite(seconds)) return "0:00";
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const remaining = safeSeconds % 60;
    return `${minutes}:${String(remaining).padStart(2, "0")}`;
  }

  function clearLinkingParams() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("sessionId");
    next.delete("eventId");
    next.delete("timestamp");
    const qs = next.toString();
    window.history.replaceState({}, "", qs ? `/?${qs}` : "/");
    setCurrentEventId(null);
    setLinkTimestampSeconds(null);
    setLinkSessionId(null);
  }

  function buildLinkingReturnUrl() {
    if (!linkSessionId) return null;
    return `/sessions/${linkSessionId}`;
  }

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
    } catch (e: unknown) {
      console.error(e);
      alert(getErrorMessage(e) || "Failed to undo last pitch");
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
    } catch (e: unknown) {
      console.error(e);
      alert(getErrorMessage(e) || "Failed to create pitcher");
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
    } catch (e: unknown) {
      console.error(e);
      alert(getErrorMessage(e) || "Failed to create session");
    }
  }

  async function savePitch(mode: "create" | "update") {
    if (editingPitchId && mode === "create") return;
    if (!editingPitchId && mode === "update") return;
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
    if (!intendedZoneId || !actualZoneId) {
      alert("Select both intended and actual zones before saving.");
      return;
    }

    const target = zoneIdToPoint(intendedZoneId);
    const actual = zoneIdToPoint(actualZoneId);
    const dx = actual.x - target.x;
    const dy = actual.y - target.y;

    try {
      if (editingPitchId) {
        const { data, error } = await supabase
          .from("pitches")
          .update({
            pitch_type: pitchType,
            tag: tag || null,
            intended_location_zone_id: intendedZoneId,
            actual_location_zone_id: actualZoneId,
            target_x: target.x,
            target_y: target.y,
            actual_x: actual.x,
            actual_y: actual.y,
            dx,
            dy,
            notes: notes || null,
          })
          .eq("id", editingPitchId)
          .eq("user_id", session.user.id)
          .select(
            "id,user_id,pitcher_id,session_id,pitch_type,tag,intended_location_zone_id,actual_location_zone_id,target_x,target_y,actual_x,actual_y,dx,dy,notes,created_at"
          )
          .single();
        if (error) throw error;

        if (data) {
          const updated = data as PitchRow;
          setPitches((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          showToast(`Updated pitch (${pitchType}) ✅`);
        }

        setEditingPitchId(null);
        resetPitchForm();
      } else {
        const { data, error } = await supabase
          .from("pitches")
          .insert({
            user_id: session.user.id,
            pitcher_id: selectedPitcherId,
            session_id: selectedSessionId,
            pitch_type: pitchType,
            tag: tag || null,
            intended_location_zone_id: intendedZoneId,
            actual_location_zone_id: actualZoneId,
            target_x: target.x,
            target_y: target.y,
            actual_x: actual.x,
            actual_y: actual.y,
            dx,
            dy,
            notes: notes || null,
          })
          .select(
            "id,user_id,pitcher_id,session_id,pitch_type,tag,intended_location_zone_id,actual_location_zone_id,target_x,target_y,actual_x,actual_y,dx,dy,notes,created_at"
          )
          .single();
        if (error) throw error;

        // Update local list so the UI updates immediately.
        if (data) {
          const newPitch = data as PitchRow;
          setPitches((prev) => [newPitch, ...prev]);

          // Calculate the correct pitch number based on chronological order
          // Sort all pitches (existing + new) by created_at ascending to get chronological order
          const allPitches = [...pitches, newPitch];
          const sorted = allPitches.sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
          const pitchNum = sorted.findIndex((p) => p.id === newPitch.id) + 1;

          showToast(`Saved pitch #${pitchNum} (${pitchType}) ✅`);

          if (currentEventId) {
            const { error: linkError } = await supabase
              .from("pitch_events")
              .update({ pitch_id: newPitch.id })
              .eq("id", currentEventId)
              .eq("user_id", session.user.id);
            if (linkError) {
              console.error(linkError);
              alert("Linking failed. This may be due to Supabase RLS policies.");
            } else {
              const returnUrl = buildLinkingReturnUrl();
              showToast("Linked marked video event ✅");
              setLinkSessionId(null);
              setLinkTimestampSeconds(null);
              setCurrentEventId(null);
              if (returnUrl) {
                window.history.replaceState({}, "", "/");
                setTimeout(() => {
                  window.location.href = returnUrl;
                }, 350);
              }
            }
          }
        }

        // Bullpen workflow: clear actual after save, optionally keep intended.
        setActualZoneId(null);
        if (!keepIntendedBetweenSaves) setIntendedZoneId(null);
      }
    } catch (e: unknown) {
      if (editingPitchId) {
        // If this fails, RLS may need to allow update where user_id = auth.uid().
        console.error(e);
        alert(getErrorMessage(e) || "Failed to update pitch. This may be blocked by row-level security.");
        return;
      }
      console.error(e);
      alert(getErrorMessage(e) || "Failed to save pitch");
    }
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
      setIntendedZoneId(null);
      setActualZoneId(null);
    } catch (e: unknown) {
      console.error(e);
      alert(getErrorMessage(e) || "Failed to clear session pitches");
    }
  }

  function startEditPitch(pitch: PitchRow) {
    setEditingPitchId(pitch.id);
    setPitchType(pitch.pitch_type);
    setNotes(pitch.notes ?? "");
    setTag(pitch.tag ?? "");
    setIntendedZoneId(isZoneId(pitch.intended_location_zone_id) ? pitch.intended_location_zone_id : null);
    setActualZoneId(isZoneId(pitch.actual_location_zone_id) ? pitch.actual_location_zone_id : null);
  }

  async function deletePitch(pitchId: string) {
    if (!supabase || !session?.user?.id) return;
    const ok = confirm("Delete this pitch? This cannot be undone.");
    if (!ok) return;

    try {
      const { error } = await supabase.from("pitches").delete().eq("id", pitchId).eq("user_id", session.user.id);
      if (error) throw error;
      setPitches((prev) => prev.filter((p) => p.id !== pitchId));
      if (editingPitchId === pitchId) {
        setEditingPitchId(null);
        resetPitchForm();
      }
      showToast("Deleted pitch");
    } catch (e: unknown) {
      // If this fails, RLS may need to allow delete where user_id = auth.uid().
      console.error(e);
      alert(getErrorMessage(e) || "Failed to delete pitch. This may be blocked by row-level security.");
    }
  }

  return (
    <main className="min-h-screen p-6 flex flex-col gap-6">
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
      {!supabaseReady && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Supabase is not configured yet. Ensure <span className="font-mono">app/.env.local</span> has{" "}
          <span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
          <span className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>, then restart{" "}
          <span className="font-mono">npm run dev</span>.
        </div>
      )}

      {session === null ? (
        <div className="p-6 text-sm text-gray-600">Loading…</div>
      ) : (
        <>
          <header className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Bullpen Tracker</h1>
            <p className="text-gray-600">
              Select a pitcher and session. Choose the intended and actual pitch locations.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/trends">View Trends</Link>
            </Button>
            <AccountBar />
          </div>
        </div>
      </header>

          {currentEventId && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 flex flex-col gap-2">
              <div className="font-medium">Linking marked pitch at {formatLinkTimestamp(linkTimestampSeconds)}</div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={clearLinkingParams}>
                  Cancel linking
                </Button>
                {buildLinkingReturnUrl() && (
              <Button asChild variant="outline" size="sm">
                <Link href={buildLinkingReturnUrl()!}>Back to session summary</Link>
              </Button>
            )}
          </div>
        </div>
      )}

      {session && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Pitcher</CardTitle>
            </CardHeader>
            <CardContent>
              <Label className="block text-sm font-medium mb-1">Select pitcher</Label>
              <Select value={selectedPitcherId} onValueChange={setSelectedPitcherId}>
                <SelectTrigger className="w-full" disabled={pitchersLoading}>
                  <SelectValue placeholder={pitchersLoading && hydrated ? "Loading…" : "Choose a pitcher"} />
                </SelectTrigger>
                <SelectContent>
                  {pitchers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.throwing_hand ? ` (${p.throwing_hand})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="mt-4 grid gap-3 md:grid-cols-3 items-end">
                <div className="md:col-span-2">
                  <Label className="block text-sm font-medium mb-1">Add pitcher</Label>
                  <Input
                    value={newPitcherName}
                    onChange={(e) => setNewPitcherName(e.target.value)}
                    placeholder="Name"
                  />
                </div>
                <div className="md:col-span-1">
                  <Label className="block text-sm font-medium mb-1">Throws</Label>
                  <Select value={newPitcherHand} onValueChange={(v) => setNewPitcherHand(toHand(v))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="R">R</SelectItem>
                      <SelectItem value="L">L</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-3">
                  <Button onClick={createPitcher}>Add pitcher</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Session</CardTitle>
            </CardHeader>
            <CardContent>
              <Label className="block text-sm font-medium mb-1">Select session</Label>
              <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
                <SelectTrigger className="w-full" disabled={!selectedPitcherId || sessionsLoading}>
                  <SelectValue
                    placeholder={
                      !selectedPitcherId
                        ? "Select a pitcher first"
                        : sessionsLoading && hydrated
                        ? "Loading…"
                        : "Choose a session"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.session_date}
                      {s.label ? ` — ${s.label}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="mt-3">
                {selectedSessionId ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/sessions/${selectedSessionId}`}>View Session Summary</Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    View Session Summary
                  </Button>
                )}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3 items-end">
                <div className="md:col-span-1">
                  <Label className="block text-sm font-medium mb-1">Date</Label>
                  <Input
                    value={newSessionDate}
                    onChange={(e) => setNewSessionDate(e.target.value)}
                    type="date"
                    disabled={Boolean(selectedSessionId) && !sessionDateUnlocked}
                  />
                  {selectedSessionId && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => setSessionDateUnlocked(true)}
                      disabled={sessionDateUnlocked}
                    >
                      Edit date
                    </Button>
                  )}
                </div>
                <div className="md:col-span-2">
                  <Label className="block text-sm font-medium mb-1">Label (optional)</Label>
                  <Input
                    value={newSessionLabel}
                    onChange={(e) => setNewSessionLabel(e.target.value)}
                    placeholder="Example: Side work, Bullpen #3"
                  />
                </div>
                <div className="md:col-span-3">
                  <Button onClick={createSession} disabled={!selectedPitcherId}>
                    Add session
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6">
        <section className="flex flex-col gap-3">
          {isEditing && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Editing pitch #{editingPitchNumber ?? "?"}
            </div>
          )}
          {currentEventId && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              Linking the next saved pitch to a marked video event.
            </div>
          )}

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-slate-700">
              <span className="font-medium">Status:</span> {status}
              <span className="ml-3 text-slate-500">
                <span className="font-medium">Now selecting:</span>{" "}
                {activeGrid === "actual" ? "Actual location" : "Intended location"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-gray-600">Filter:</span>
              <Button
                size="sm"
                variant={pitchTypeFilter === "ALL" ? "default" : "outline"}
                onClick={() => setPitchTypeFilter("ALL")}
                type="button"
              >
                All
              </Button>
              {availablePitchTypes.map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={pitchTypeFilter === t ? "default" : "outline"}
                  onClick={() => setPitchTypeFilter(t)}
                  type="button"
                >
                  {t}
                </Button>
              ))}
            </div>

            <div className="text-sm text-slate-500 md:text-right">
              Showing {filteredPitches.length} of {pitches.length}
            </div>
          </div>

          <div className="grid gap-3 max-w-[900px]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:scale-[0.92] lg:origin-top-left">
              <div
                className={`rounded-lg border-2 p-2 transition ${
                  activeGrid === "intended" ? "border-gray-900" : "border-transparent opacity-60"
                }`}
                onClick={() => setActiveGrid("intended")}
              >
                <StrikeZoneGrid
                  label="Intended location"
                  value={intendedZoneId}
                  onSelect={(zoneId) => {
                    setActiveGrid("intended");
                    setIntendedZoneId(zoneId);
                    setActualZoneId(null);
                  }}
                />
              </div>
              <div
                className={`rounded-lg border-2 p-2 transition ${
                  activeGrid === "actual" ? "border-gray-900" : "border-transparent opacity-60"
                }`}
                onClick={() => setActiveGrid("actual")}
              >
                <StrikeZoneGrid
                  label="Actual location"
                  value={actualZoneId}
                  onSelect={(zoneId) => {
                    setActiveGrid("actual");
                    setActualZoneId(zoneId);
                  }}
                />
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {!isEditing ? (
                <Button
                  onClick={() => savePitch("create")}
                  disabled={!session || !selectedPitcherId || !selectedSessionId || !intendedZoneId || !actualZoneId}
                >
                  Save pitch
                </Button>
              ) : (
                <Button
                  onClick={() => savePitch("update")}
                  disabled={!session || !selectedPitcherId || !selectedSessionId || !intendedZoneId || !actualZoneId}
                >
                  Update pitch
                </Button>
              )}

              {isEditing && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingPitchId(null);
                    resetPitchForm();
                  }}
                >
                  Cancel edit
                </Button>
              )}

              <label className="ml-2 inline-flex items-center gap-2 text-sm text-slate-600 select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={keepIntendedBetweenSaves}
                  onChange={(e) => setKeepIntendedBetweenSaves(e.target.checked)}
                />
                <span>Keep intended after save</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setActualZoneId(null)}
                disabled={!actualZoneId}
                title="Clear the actual selection"
              >
                Clear actual
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  setIntendedZoneId(null);
                  setActualZoneId(null);
                }}
                title="Clear intended and actual"
              >
                Clear intended
              </Button>
            </div>

            <div className="flex items-center">
              <Button
                variant="destructive"
                onClick={clearSessionPitches}
                disabled={!selectedSessionId || pitches.length === 0}
                title="Delete all pitches in this session"
              >
                Clear session pitches
              </Button>
            </div>
          </div>

          <div className="text-sm text-gray-700 space-y-1">
            <button
              type="button"
              className="text-xs text-slate-600 underline underline-offset-4 hover:text-slate-900"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? "Hide advanced metrics" : "Show advanced metrics"}
            </button>
            {showAdvanced && (
              <>
                <div>
                  Miss (dx, dy):{" "}
                  <span className="font-mono">{deltas ? `${fmt(deltas.dx)}, ${fmt(deltas.dy)}` : "—"}</span>
                </div>
                <div>
                  Miss distance: <span className="font-mono">{deltas ? fmt(deltas.dist) : "—"}</span>
                </div>
              </>
            )}
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

        <section className="flex flex-col gap-4">
          <div className="grid gap-6 lg:grid-cols-[1fr_420px] items-start">
            <div className="min-w-0">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle>Recent pitches</CardTitle>
                  <CardAction>
                    <Button variant="outline" size="sm" onClick={undoLastPitch} disabled={!pitches.length}>
                      Undo last
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent>

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
                          <div
                            key={p.id}
                            className={`w-full px-3 py-2 text-sm flex items-center justify-between gap-3 ${
                              isHi ? "bg-gray-50" : "bg-white"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setHighlightPitchId((cur) => (cur === p.id ? null : p.id))}
                              className="flex items-center gap-3 flex-1 text-left"
                              title="Click to highlight"
                            >
                              <div className="font-mono text-gray-500">#{pitchNum ?? "?"}</div>
                              <div className="font-medium">{p.pitch_type}</div>
                              {p.tag ? (
                                <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                                  {p.tag}
                                </span>
                              ) : null}
                              {p.tag ? (
                                <div className="text-gray-500 text-xs">
                                  Tag: <span className="font-medium">{p.tag}</span>
                                </div>
                              ) : null}
                            </button>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={out ? "text-red-700 border-red-200" : "text-green-700 border-green-200"}
                              >
                                {out ? "Out" : "In"}
                              </Badge>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startEditPitch(p)}
                                type="button"
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => deletePitch(p.id)}
                                type="button"
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-2 text-xs text-gray-500">Click a row to highlight that pitch.</div>
                </CardContent>
              </Card>
            </div>

            <div className="min-w-0 flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Pitch details</CardTitle>
                </CardHeader>
                <CardContent>
                  <Label className="block text-sm font-medium mb-1">Pitch type</Label>
                  <Select value={pitchType} onValueChange={setPitchType}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FB">Fastball (FB)</SelectItem>
                      <SelectItem value="SL">Slider (SL)</SelectItem>
                      <SelectItem value="CB">Curveball (CB)</SelectItem>
                      <SelectItem value="CH">Changeup (CH)</SelectItem>
                      <SelectItem value="CT">Cutter (CT)</SelectItem>
                      <SelectItem value="SI">Sinker (SI)</SelectItem>
                      <SelectItem value="OT">Other</SelectItem>
                    </SelectContent>
                  </Select>

                  <Label className="block text-sm font-medium mt-4 mb-1">Tag (optional)</Label>
                  <Input
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    placeholder="Example: miss up, good feel, bullpen"
                  />

                  <Label className="block text-sm font-medium mt-4 mb-1">Notes (optional)</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="min-h-[100px]"
                    placeholder="Example: working glove-side, missed arm-side today"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Session summary</CardTitle>
                </CardHeader>
                <CardContent>
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
                        {showAdvanced && (
                          <>
                            <div className="rounded-lg border p-3">
                              <div className="text-gray-500">Avg dx</div>
                              <div className="text-xl font-semibold">{sessionStats.avgDx.toFixed(3)}</div>
                            </div>
                            <div className="rounded-lg border p-3">
                              <div className="text-gray-500">Avg dy</div>
                              <div className="text-xl font-semibold">{sessionStats.avgDy.toFixed(3)}</div>
                            </div>
                          </>
                        )}
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
                          <Separator className="mb-2" />
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
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </div>
        </>
      )}
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div />}>
      <HomeClient />
    </Suspense>
  );
}
