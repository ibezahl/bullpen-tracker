"use client";

import { Suspense, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton, SkeletonPitchList, SkeletonSessionSummary } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import AccountBar from "@/components/AccountBar";
import { StrikeZoneGrid } from "@/components/StrikeZoneGrid";
import { PitcherCard } from "@/components/PitcherCard";
import { SessionCard } from "@/components/SessionCard";
import { supabase } from "@/lib/supabaseClient";
import { useDebounce } from "@/lib/hooks";
import { withRetry, getErrorMessage } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildZones5x5, type ZoneId, isZoneId } from "@/lib/strikeZone";
import { CheckCircle, XCircle, RefreshCw } from "lucide-react";

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

type Hand = "R" | "L";

const DEFAULT_PITCH_TYPE = "FB";
const zones5x5 = buildZones5x5();
const zoneById = new Map(zones5x5.map((zone) => [zone.id, zone]));
const STORAGE_PITCHER_KEY = "bullpen:selectedPitcherId";
const STORAGE_SESSION_KEY = "bullpen:selectedSessionId";
const PAGE_SIZE = 20;

function zoneIdToPoint(zoneId: ZoneId): Pt {
  const zone = zoneById.get(zoneId);
  if (!zone) return { x: 0.5, y: 0.5 };

  const c = "c5" in (zone as any) ? (zone as any).c5 : (zone as any).col;
  const r = "r5" in (zone as any) ? (zone as any).r5 : (zone as any).row;

  return {
    x: (c + 0.5) / 5,
    y: (r + 0.5) / 5,
  };
}

function HomeClient() {
  const supabaseReady = Boolean(supabase);
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionFromUrl = searchParams.get("session");
  const { showToast } = useToast();
  const confirm = useConfirm();

  // Auth
  const [session, setSession] = useState<Session | null>(null);
  // Domain
  const [pitchType, setPitchType] = useState<string>(DEFAULT_PITCH_TYPE);
  const [notes, setNotes] = useState<string>("");
  const [tag, setTag] = useState<string>("");

  // Filters and selection
  const [pitchTypeFilter, setPitchTypeFilter] = useState<string>("ALL");
  const debouncedPitchTypeFilter = useDebounce(pitchTypeFilter, 300);
  const [highlightPitchId, setHighlightPitchId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);

  const [pitchers, setPitchers] = useState<Pitcher[]>([]);
  const [pitchersLoading, setPitchersLoading] = useState(false);
  const [selectedPitcherId, setSelectedPitcherId] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const hasSessions = Array.isArray(sessions) && sessions.length > 0;
  const sessionsRequestIdRef = useRef(0);
  const SESSIONS_TTL_MS = 2 * 60 * 1000;
  const PITCHES_TTL_MS = 2 * 60 * 1000;

  const sessionsCacheRef = useRef(new Map<string, { at: number; data: SessionRow[] }>());
  const pitchesCacheRef = useRef(new Map<string, { at: number; data: PitchRow[] }>());

  const nowMs = () => Date.now();

  const getCachedSessions = (pitcherId: string) => {
    const hit = sessionsCacheRef.current.get(pitcherId);
    if (!hit) return null;
    if (nowMs() - hit.at > SESSIONS_TTL_MS) {
      sessionsCacheRef.current.delete(pitcherId);
      return null;
    }
    return hit.data;
  };

  const setCachedSessions = (pitcherId: string, data: SessionRow[]) => {
    sessionsCacheRef.current.set(pitcherId, { at: nowMs(), data });
  };

  const invalidateSessionsCache = (pitcherId: string) => {
    sessionsCacheRef.current.delete(pitcherId);
  };

  const getCachedPitches = (sessionId: string) => {
    const hit = pitchesCacheRef.current.get(sessionId);
    if (!hit) return null;
    if (nowMs() - hit.at > PITCHES_TTL_MS) {
      pitchesCacheRef.current.delete(sessionId);
      return null;
    }
    return hit.data;
  };

  const setCachedPitches = (sessionId: string, data: PitchRow[]) => {
    pitchesCacheRef.current.set(sessionId, { at: nowMs(), data });
  };

  const invalidatePitchesCache = (sessionId: string) => {
    pitchesCacheRef.current.delete(sessionId);
  };

  // Strike zone
  const [intendedZoneId, setIntendedZoneId] = useState<ZoneId | null>(null);
  const [actualZoneId, setActualZoneId] = useState<ZoneId | null>(null);
  const [editingPitchId, setEditingPitchId] = useState<string | null>(null);
  const [activeGrid, setActiveGrid] = useState<"actual" | "intended">("actual");

  // Bullpen: keep intended toggle and pitches state
  const [keepIntendedBetweenSaves, setKeepIntendedBetweenSaves] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [pitches, setPitches] = useState<PitchRow[]>([]);
  const [pitchesLoading, setPitchesLoading] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [linkTimestampSeconds, setLinkTimestampSeconds] = useState<number | null>(null);
  const [linkSessionId, setLinkSessionId] = useState<string | null>(null);

  const filteredPitches = useMemo(() => {
    if (debouncedPitchTypeFilter === "ALL") return pitches;
    return pitches.filter((p) => p.pitch_type === debouncedPitchTypeFilter);
  }, [pitches, debouncedPitchTypeFilter]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(0);
  }, [debouncedPitchTypeFilter]);

  const pitchNumberById = useMemo(() => {
    const asc = [...pitches].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const map = new Map<string, number>();
    asc.forEach((p, idx) => map.set(p.id, idx + 1));
    return map;
  }, [pitches]);

  function resetPitchForm() {
    setPitchType(DEFAULT_PITCH_TYPE);
    setNotes("");
    setTag("");
    setIntendedZoneId(null);
    setActualZoneId(null);
  }

  // Hydrate from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedPitcherId = window.localStorage.getItem(STORAGE_PITCHER_KEY) ?? "";
    const storedSessionId = window.localStorage.getItem(STORAGE_SESSION_KEY);
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

  // Session stats and pitch breakdown
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

  const loadSessionsForPitcher = useCallback(async (pitcherId: string) => {
    const cached = getCachedSessions(pitcherId);
    if (cached) {
      setSessions(cached);
      setSessionsLoading(false);

      if (cached.length > 0) {
        setSelectedSessionId((current) => {
          const ok = Boolean(current) && cached.some((row) => row.id === current);
          return ok ? current : cached[0].id;
        });
      } else {
        setSelectedSessionId(null);
      }
      return;
    }

    const requestId = ++sessionsRequestIdRef.current;
    setSessionsLoading(true);

    try {
      const result = await withRetry(async () => {
        const { data, error } = await supabase
          .from("sessions")
          .select("id,pitcher_id,session_date,label,notes,created_at")
          .eq("pitcher_id", pitcherId)
          .order("session_date", { ascending: false })
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data;
      });

      if (requestId !== sessionsRequestIdRef.current) return;

      setSessions((result ?? []) as SessionRow[]);
      setCachedSessions(pitcherId, (result ?? []) as SessionRow[]);
      if ((result?.length ?? 0) > 0) {
        setSelectedSessionId((current) => {
          const hasSelected = Boolean(current) && result?.some((row) => row.id === current);
          return hasSelected ? current : result[0].id;
        });
      } else {
        setSelectedSessionId(null);
      }
    } catch (e) {
      console.error("[sessions] load error:", e);
      showToast(getErrorMessage(e) || "Failed to load sessions", "error");
      setSessions([]);
      setSelectedSessionId(null);
    } finally {
      if (requestId === sessionsRequestIdRef.current) {
        setSessionsLoading(false);
      }
    }
  }, [showToast]);

  // Load pitchers when signed in
  useEffect(() => {
    if (!supabase || !session?.user?.id) return;

    const load = async () => {
      setPitchersLoading(true);
      try {
        const result = await withRetry(async () => {
          const { data, error } = await supabase
            .from("pitchers")
            .select("id,name,throwing_hand,created_at")
            .order("created_at", { ascending: false });
          if (error) throw error;
          return data;
        });

        setPitchers((result ?? []) as Pitcher[]);

        if (!selectedPitcherId && (result?.length ?? 0) > 0) {
          setSelectedPitcherId(result[0].id);
        }
      } catch (e: unknown) {
        console.error(e);
        showToast(getErrorMessage(e) || "Failed to load pitchers", "error");
      } finally {
        setPitchersLoading(false);
      }
    };

    load();
  }, [session?.user?.id, showToast]);

  // Load sessions when pitcher changes
  useEffect(() => {
    if (!supabase || !session?.user?.id || !selectedPitcherId) {
      setSessions([]);
      setSelectedSessionId(null);
      setSessionsLoading(false);
      return;
    }

    setPitches([]);
    setSelectedSessionId(null);
    loadSessionsForPitcher(selectedPitcherId);
  }, [selectedPitcherId, session?.user?.id, loadSessionsForPitcher]);

  useEffect(() => {
    if (!hasSessions) return;
    if (!sessionFromUrl) return;

    if (sessionFromUrl !== selectedSessionId) {
      const exists = sessions.some((s) => s.id === sessionFromUrl);
      if (exists) {
        setSelectedSessionId(sessionFromUrl);
      }
    }
  }, [hasSessions, sessions, sessionFromUrl, selectedSessionId]);

  useEffect(() => {
    if (!sessionFromUrl) return;
    if (!hasSessions) return;

    const exists = sessions.some((s) => s.id === sessionFromUrl);

    if (!exists) {
      setSelectedSessionId(null);

      const params = new URLSearchParams(searchParams.toString());
      params.delete("session");

      const qs = params.toString();
      router.replace(qs ? `/?${qs}` : "/", { scroll: false });
    }
  }, [hasSessions, sessionFromUrl, sessions, searchParams, router]);

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
    setCurrentPage(0);

    const load = async () => {
      const cachedP = getCachedPitches(selectedSessionId);
      if (cachedP) {
        setPitches(cachedP);
        setPitchesLoading(false);
        return;
      }
      setPitchesLoading(true);
      try {
        const result = await withRetry(async () => {
          const { data, error } = await supabase
            .from("pitches")
            .select(
              "id,user_id,pitcher_id,session_id,pitch_type,tag,intended_location_zone_id,actual_location_zone_id,target_x,target_y,actual_x,actual_y,dx,dy,notes,created_at"
            )
            .eq("session_id", selectedSessionId)
            .order("created_at", { ascending: false })
            .limit(1000);
          if (error) throw error;
          return data;
        });

        setPitches((result ?? []) as PitchRow[]);
        setCachedPitches(selectedSessionId, (result ?? []) as PitchRow[]);
      } catch (e: unknown) {
        console.error(e);
        showToast(getErrorMessage(e) || "Failed to load pitches", "error");
      } finally {
        setPitchesLoading(false);
      }
    };

    load();
  }, [selectedSessionId, session?.user?.id, showToast]);

  useEffect(() => {
    if (!pendingSessionId) return;
    if (!sessions.length) return;
    const exists = sessions.some((s) => s.id === pendingSessionId);
    if (exists) {
      setSelectedSessionId(pendingSessionId);
      setPendingSessionId(null);
    }
  }, [pendingSessionId, sessions]);

  useEffect(() => {
    if (!hasSessions && selectedSessionId) {
      setSelectedSessionId(null);
    }
  }, [hasSessions, selectedSessionId]);

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

  // Undo last pitch
  async function undoLastPitch() {
    if (!supabase || !session?.user?.id || !selectedSessionId) return;
    if (!pitches.length) return;

    const last = pitches[0];
    const ok = await confirm({
      title: "Undo last pitch",
      message: `Delete the last pitch (${last.pitch_type})? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await withRetry(async () => {
        const { error } = await supabase
          .from("pitches")
          .delete()
          .eq("id", last.id)
          .eq("user_id", session.user.id);
        if (error) throw error;
      });

      setPitches((prev) => prev.filter((p) => p.id !== last.id));
      if (highlightPitchId === last.id) setHighlightPitchId(null);
      if (selectedSessionId) {
        invalidatePitchesCache(selectedSessionId);
        invalidateSessionsCache(selectedPitcherId);
      }
      showToast(`Undid last pitch (${last.pitch_type})`, "success");
    } catch (e: unknown) {
      console.error(e);
      showToast(getErrorMessage(e) || "Failed to undo last pitch", "error");
    }
  }

  async function handleCreatePitcher(name: string, hand: Hand) {
    if (!supabase || !session?.user?.id) {
      showToast("Please sign in first", "error");
      return;
    }
    if (!name) {
      showToast("Enter a pitcher name", "warning");
      return;
    }

    try {
      const result = await withRetry(async () => {
        const { data, error } = await supabase
          .from("pitchers")
          .insert({ user_id: session.user.id, name, throwing_hand: hand })
          .select("id,name,throwing_hand,created_at")
          .single();
        if (error) throw error;
        return data;
      });

      const row = result as unknown as Pitcher;
      setPitchers((prev) => [row, ...prev]);
      setSelectedPitcherId(row.id);
      showToast(`Added pitcher: ${name}`, "success");
    } catch (e: unknown) {
      console.error(e);
      showToast(getErrorMessage(e) || "Failed to create pitcher", "error");
    }
  }

  async function handleCreateSession(date: string, label: string) {
    if (!supabase || !session?.user?.id) {
      showToast("Please sign in first", "error");
      return;
    }
    if (!selectedPitcherId) {
      showToast("Select a pitcher first", "warning");
      return;
    }

    try {
      const result = await withRetry(async () => {
        const { data, error } = await supabase
          .from("sessions")
          .insert({
            user_id: session.user.id,
            pitcher_id: selectedPitcherId,
            session_date: date,
            label: label || null,
          })
          .select("id,pitcher_id,session_date,label,notes,created_at")
          .single();
        if (error) throw error;
        return data;
      });

      const row = result as unknown as SessionRow;

      // Auto-refresh: invalidate cache and reload sessions
      invalidateSessionsCache(selectedPitcherId);
      await loadSessionsForPitcher(selectedPitcherId);
      setSelectedSessionId(row.id);
      showToast(`Created session: ${date}${label ? ` — ${label}` : ""}`, "success");
    } catch (e: unknown) {
      console.error(e);
      showToast(getErrorMessage(e) || "Failed to create session", "error");
    }
  }

  async function handleRefreshSessions() {
    if (!selectedPitcherId) return;
    invalidateSessionsCache(selectedPitcherId);
    if (selectedSessionId) invalidatePitchesCache(selectedSessionId);
    await loadSessionsForPitcher(selectedPitcherId);
    showToast("Sessions refreshed", "info");
  }

  async function savePitch(mode: "create" | "update") {
    if (editingPitchId && mode === "create") return;
    if (!editingPitchId && mode === "update") return;
    if (!supabase || !session?.user?.id) {
      showToast("Please sign in first", "error");
      return;
    }
    if (!selectedPitcherId) {
      showToast("Select a pitcher first", "warning");
      return;
    }
    if (!selectedSessionId) {
      showToast("Select or create a session first", "warning");
      return;
    }
    if (!intendedZoneId || !actualZoneId) {
      showToast("Select both intended and actual zones before saving", "warning");
      return;
    }

    const target = zoneIdToPoint(intendedZoneId);
    const actual = zoneIdToPoint(actualZoneId);
    const dx = actual.x - target.x;
    const dy = actual.y - target.y;

    // Optimistic update: clear form immediately
    const previousActualZone = actualZoneId;
    const previousIntendedZone = intendedZoneId;
    setActualZoneId(null);
    if (!keepIntendedBetweenSaves) setIntendedZoneId(null);
    setIsSaving(true);

    try {
      if (editingPitchId) {
        const result = await withRetry(async () => {
          const { data, error } = await supabase
            .from("pitches")
            .update({
              pitch_type: pitchType,
              tag: tag || null,
              intended_location_zone_id: previousIntendedZone,
              actual_location_zone_id: previousActualZone,
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
          return data;
        });

        if (result) {
          const updated = result as PitchRow;
          setPitches((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          if (selectedSessionId) {
            invalidatePitchesCache(selectedSessionId);
            invalidateSessionsCache(selectedPitcherId);
          }
          showToast(`Updated pitch (${pitchType})`, "success");
        }

        setEditingPitchId(null);
        resetPitchForm();
      } else {
        const result = await withRetry(async () => {
          const { data, error } = await supabase
            .from("pitches")
            .insert({
              user_id: session.user.id,
              pitcher_id: selectedPitcherId,
              session_id: selectedSessionId,
              pitch_type: pitchType,
              tag: tag || null,
              intended_location_zone_id: previousIntendedZone,
              actual_location_zone_id: previousActualZone,
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
          return data;
        });

        if (result) {
          const newPitch = result as PitchRow;
          setPitches((prev) => [newPitch, ...prev]);
          if (selectedSessionId) {
            invalidatePitchesCache(selectedSessionId);
            invalidateSessionsCache(selectedPitcherId);
          }

          const allPitches = [...pitches, newPitch];
          const sorted = allPitches.sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
          const pitchNum = sorted.findIndex((p) => p.id === newPitch.id) + 1;

          showToast(`Saved pitch #${pitchNum} (${pitchType})`, "success");

          if (currentEventId) {
            try {
              await supabase
                .from("pitch_events")
                .update({ pitch_id: newPitch.id })
                .eq("id", currentEventId)
                .eq("user_id", session.user.id);

              const returnUrl = buildLinkingReturnUrl();
              showToast("Linked marked video event", "success");
              setLinkSessionId(null);
              setLinkTimestampSeconds(null);
              setCurrentEventId(null);
              if (returnUrl) {
                window.history.replaceState({}, "", "/");
                setTimeout(() => {
                  window.location.href = returnUrl;
                }, 350);
              }
            } catch (linkError) {
              console.error(linkError);
              showToast("Linking failed. This may be due to Supabase RLS policies.", "error");
            }
          }
        }
      }
    } catch (e: unknown) {
      // Rollback optimistic update
      setActualZoneId(previousActualZone);
      if (!keepIntendedBetweenSaves) setIntendedZoneId(previousIntendedZone);

      console.error(e);
      showToast(
        getErrorMessage(e) || (editingPitchId ? "Failed to update pitch" : "Failed to save pitch"),
        "error"
      );
    } finally {
      setIsSaving(false);
    }
  }

  // Clear all pitches for the currently selected session
  async function clearSessionPitches() {
    if (!supabase || !session?.user?.id || !selectedSessionId) return;

    const ok = await confirm({
      title: "Clear all pitches",
      message: "Delete ALL pitches for this session? This cannot be undone.",
      confirmLabel: "Delete all",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await withRetry(async () => {
        const { error } = await supabase
          .from("pitches")
          .delete()
          .eq("session_id", selectedSessionId)
          .eq("user_id", session.user.id);
        if (error) throw error;
      });

      setPitches([]);
      setIntendedZoneId(null);
      setActualZoneId(null);
      if (selectedSessionId) {
        invalidatePitchesCache(selectedSessionId);
        invalidateSessionsCache(selectedPitcherId);
      }
      showToast("Cleared all pitches from session", "success");
    } catch (e: unknown) {
      console.error(e);
      showToast(getErrorMessage(e) || "Failed to clear session pitches", "error");
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

    const pitch = pitches.find((p) => p.id === pitchId);
    const ok = await confirm({
      title: "Delete pitch",
      message: `Delete this ${pitch?.pitch_type || ""} pitch? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await withRetry(async () => {
        const { error } = await supabase.from("pitches").delete().eq("id", pitchId).eq("user_id", session.user.id);
        if (error) throw error;
      });

      setPitches((prev) => prev.filter((p) => p.id !== pitchId));
      if (editingPitchId === pitchId) {
        setEditingPitchId(null);
        resetPitchForm();
      }
      if (selectedSessionId) {
        invalidatePitchesCache(selectedSessionId);
        invalidateSessionsCache(selectedPitcherId);
      }
      showToast("Deleted pitch", "success");
    } catch (e: unknown) {
      console.error(e);
      showToast(getErrorMessage(e) || "Failed to delete pitch", "error");
    }
  }

  // Handler for clickable pitch type breakdown
  const handlePitchTypeClick = (type: string) => {
    setPitchTypeFilter(type);
    setCurrentPage(0);
  };

  return (
    <main className="min-h-screen p-4 md:p-6 flex flex-col gap-6">
      <div className="mx-auto w-full max-w-6xl px-2 md:px-6">
        {!supabaseReady && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Supabase is not configured yet. Ensure <span className="font-mono">app/.env.local</span> has{" "}
            <span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
            <span className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>, then restart{" "}
            <span className="font-mono">npm run dev</span>.
          </div>
        )}

        {session === null ? (
          <div className="p-6 text-sm text-gray-600 flex items-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : (
          <>
            <header className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold">Bullpen Tracker</h1>
                  <p className="text-gray-600 text-sm md:text-base">
                    Select a pitcher and session. Choose the intended and actual pitch locations.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button asChild variant="outline" className="min-h-[44px]">
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
                  <Button variant="outline" size="sm" onClick={clearLinkingParams} className="min-h-[36px]">
                    Cancel linking
                  </Button>
                  {buildLinkingReturnUrl() && (
                    <Button asChild variant="outline" size="sm" className="min-h-[36px]">
                      <Link href={buildLinkingReturnUrl()!}>Back to session summary</Link>
                    </Button>
                  )}
                </div>
              </div>
            )}

            {session && (
              <div className="grid gap-4 md:grid-cols-2">
                <PitcherCard
                  pitchers={pitchers}
                  selectedPitcherId={selectedPitcherId}
                  onSelectPitcher={setSelectedPitcherId}
                  onCreatePitcher={handleCreatePitcher}
                  loading={pitchersLoading}
                  hydrated={hydrated}
                />
                <SessionCard
                  sessions={sessions}
                  selectedSessionId={selectedSessionId}
                  onSelectSession={(id) => {
                    setSelectedSessionId(id);
                    const params = new URLSearchParams(searchParams.toString());
                    params.set("session", id);
                    router.push(`/?${params.toString()}`, { scroll: false });
                  }}
                  onCreateSession={handleCreateSession}
                  onRefresh={handleRefreshSessions}
                  loading={sessionsLoading}
                  selectedPitcherId={selectedPitcherId}
                  disabled={!selectedPitcherId}
                />
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

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-gray-600 text-sm">Filter:</span>
                    <Button
                      size="sm"
                      variant={pitchTypeFilter === "ALL" ? "default" : "outline"}
                      onClick={() => setPitchTypeFilter("ALL")}
                      type="button"
                      className="min-h-[36px]"
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
                        className="min-h-[36px]"
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div
                      className={`rounded-lg border-2 p-2 transition cursor-pointer ${
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
                      className={`rounded-lg border-2 p-2 transition cursor-pointer ${
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
                        disabled={!session || !selectedPitcherId || !selectedSessionId || !intendedZoneId || !actualZoneId || isSaving}
                        className="min-h-[44px] min-w-[100px]"
                      >
                        {isSaving ? "Saving..." : "Save pitch"}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => savePitch("update")}
                        disabled={!session || !selectedPitcherId || !selectedSessionId || !intendedZoneId || !actualZoneId || isSaving}
                        className="min-h-[44px] min-w-[120px]"
                      >
                        {isSaving ? "Updating..." : "Update pitch"}
                      </Button>
                    )}

                    {isEditing && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingPitchId(null);
                          resetPitchForm();
                        }}
                        className="min-h-[44px]"
                      >
                        Cancel edit
                      </Button>
                    )}

                    <label className="ml-2 inline-flex items-center gap-2 text-sm text-slate-600 select-none cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
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
                      className="min-h-[44px]"
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
                      className="min-h-[44px]"
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
                      className="min-h-[44px]"
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
                </div>
              </section>

              <section className="flex flex-col gap-4">
                <div className="grid gap-6 lg:grid-cols-[1fr_420px] items-start">
                  <div className="min-w-0">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle>Recent pitches</CardTitle>
                        <CardAction>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={undoLastPitch}
                            disabled={!pitches.length}
                            className="min-h-[36px]"
                          >
                            Undo last
                          </Button>
                        </CardAction>
                      </CardHeader>
                      <CardContent>
                        {!selectedSessionId ? (
                          <div className="text-sm text-gray-600">Select a session to see pitches.</div>
                        ) : pitchesLoading ? (
                          <SkeletonPitchList count={5} />
                        ) : !pitches.length ? (
                          <div className="text-sm text-gray-600">No pitches yet.</div>
                        ) : !filteredPitches.length ? (
                          <div className="text-sm text-gray-600">No pitches match this filter.</div>
                        ) : (
                          <>
                            <div className="divide-y rounded-lg border">
                              {filteredPitches.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((p) => {
                                const isHi = p.id === highlightPitchId;
                                const out =
                                  p.actual_x < 0.25 || p.actual_x > 0.75 || p.actual_y < 0.25 || p.actual_y > 0.75;
                                const pitchNum = pitchNumberById.get(p.id);

                                return (
                                  <div
                                    key={p.id}
                                    className={`w-full px-3 py-3 text-sm flex items-center justify-between gap-3 ${
                                      isHi ? "bg-gray-50" : "bg-white"
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => setHighlightPitchId((cur) => (cur === p.id ? null : p.id))}
                                      className="flex items-center gap-3 flex-1 text-left min-h-[44px]"
                                      title="Click to highlight"
                                      aria-pressed={isHi}
                                    >
                                      <div className="font-mono text-gray-500">#{pitchNum ?? "?"}</div>
                                      <div className="font-medium">{p.pitch_type}</div>
                                      {p.tag && (
                                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                                          {p.tag}
                                        </span>
                                      )}
                                    </button>
                                    <div className="flex items-center gap-2">
                                      <Badge
                                        variant="outline"
                                        className={`flex items-center gap-1 ${
                                          out ? "text-red-700 border-red-200" : "text-green-700 border-green-200"
                                        }`}
                                        aria-label={out ? "Out of zone" : "In zone"}
                                      >
                                        {out ? (
                                          <>
                                            <XCircle className="h-3 w-3" aria-hidden="true" />
                                            <span>Out</span>
                                          </>
                                        ) : (
                                          <>
                                            <CheckCircle className="h-3 w-3" aria-hidden="true" />
                                            <span>In</span>
                                          </>
                                        )}
                                      </Badge>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => startEditPitch(p)}
                                        type="button"
                                        className="min-h-[36px] min-w-[50px]"
                                      >
                                        Edit
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => deletePitch(p.id)}
                                        type="button"
                                        className="min-h-[36px] min-w-[60px]"
                                      >
                                        Delete
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Pagination */}
                            {filteredPitches.length > PAGE_SIZE && (
                              <div className="mt-3 flex items-center justify-between">
                                <div className="text-xs text-gray-500">
                                  Showing {currentPage * PAGE_SIZE + 1}-
                                  {Math.min((currentPage + 1) * PAGE_SIZE, filteredPitches.length)} of{" "}
                                  {filteredPitches.length}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                                    disabled={currentPage === 0}
                                    className="min-h-[36px]"
                                  >
                                    Previous
                                  </Button>
                                  <span className="text-sm text-gray-600">
                                    Page {currentPage + 1} of {Math.ceil(filteredPitches.length / PAGE_SIZE)}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      setCurrentPage((p) =>
                                        Math.min(Math.ceil(filteredPitches.length / PAGE_SIZE) - 1, p + 1)
                                      )
                                    }
                                    disabled={currentPage >= Math.ceil(filteredPitches.length / PAGE_SIZE) - 1}
                                    className="min-h-[36px]"
                                  >
                                    Next
                                  </Button>
                                </div>
                              </div>
                            )}
                          </>
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
                        <Label htmlFor="pitch-type-select" className="block text-sm font-medium mb-1">
                          Pitch type
                        </Label>
                        <Select value={pitchType} onValueChange={setPitchType}>
                          <SelectTrigger id="pitch-type-select" className="w-full">
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

                        <Label htmlFor="pitch-tag" className="block text-sm font-medium mt-4 mb-1">
                          Tag (optional)
                        </Label>
                        <Input
                          id="pitch-tag"
                          value={tag}
                          onChange={(e) => setTag(e.target.value)}
                          placeholder="Example: miss up, good feel, bullpen"
                        />

                        <Label htmlFor="pitch-notes" className="block text-sm font-medium mt-4 mb-1">
                          Notes (optional)
                        </Label>
                        <Textarea
                          id="pitch-notes"
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
                          <SkeletonSessionSummary />
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
                                    <button
                                      key={row.pitch_type}
                                      type="button"
                                      onClick={() => handlePitchTypeClick(row.pitch_type)}
                                      className={`flex items-center justify-between px-3 py-2 text-sm w-full text-left hover:bg-gray-50 transition-colors min-h-[44px] ${
                                        pitchTypeFilter === row.pitch_type ? "bg-gray-100" : ""
                                      }`}
                                      aria-pressed={pitchTypeFilter === row.pitch_type}
                                    >
                                      <div className="font-medium">{row.pitch_type}</div>
                                      <div className="text-gray-600">{row.n} pitches</div>
                                      <div className="text-gray-600">avg {row.avgDist.toFixed(3)}</div>
                                      <div className="text-gray-600">{Math.round(row.outOfZonePct * 100)}% O-Z</div>
                                    </button>
                                  ))}
                                </div>
                                <div className="mt-2 text-xs text-gray-500">
                                  Click a row to filter by pitch type. Zone is the centered box: actual_x/y outside
                                  0.25–0.75 counts as out of zone.
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
