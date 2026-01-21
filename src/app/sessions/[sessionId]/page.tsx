"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StrikeZoneHeatmap } from "@/components/StrikeZoneHeatmap";
import { StrikeZoneGrid } from "@/components/StrikeZoneGrid";
import { Skeleton, SkeletonCard, SkeletonHeatmap, SkeletonPitchList } from "@/components/ui/skeleton";
import { buildZones5x5, computeSummaryStats, computeZoneCounts, type ZoneId } from "@/lib/strikeZone";
import { supabase } from "@/lib/supabaseClient";

type PitchRow = {
  id: string;
  pitch_type: string;
  tag: string | null;
  intended_location_zone_id: string | null;
  actual_location_zone_id: string | null;
  notes: string | null;
  created_at: string | null;
};

type SessionVideoRow = {
  id: string;
  session_id: string;
  video_url: string;
  original_filename: string | null;
  created_at: string;
};

type PitchEventRow = {
  id: string;
  session_id: string;
  video_id: string;
  timestamp_seconds: number;
  pitch_id: string | null;
  created_at: string;
};

type ReviewFormState = {
  pitch_type: string;
  intended_location_zone_id: ZoneId | null;
  actual_location_zone_id: ZoneId | null;
  tag: string;
  notes: string;
};

type SessionRow = {
  id: string;
  session_date: string | null;
  label: string | null;
  pitcher_id: string | null;
  created_at: string;
};

type PitcherRow = {
  id: string;
  name: string;
};

const zones5x5 = buildZones5x5();
const zoneById = new Map(zones5x5.map((zone) => [zone.id, zone]));
const PITCH_TYPE_OPTIONS = [
  { value: "FB", label: "Fastball (FB)" },
  { value: "SL", label: "Slider (SL)" },
  { value: "CB", label: "Curveball (CB)" },
  { value: "CH", label: "Changeup (CH)" },
  { value: "CT", label: "Cutter (CT)" },
  { value: "SI", label: "Sinker (SI)" },
  { value: "OT", label: "Other" },
] as const;

function friendlyZoneLabel(zoneId: string | null | undefined) {
  if (!zoneId) return "Unknown";
  const zone = zoneById.get(zoneId as ZoneId);
  if (!zone) return "Unknown";

  const rowLabels = ["High", "High", "Middle", "Low", "Low"] as const;
  const colLabels = ["Left", "Left", "Middle", "Right", "Right"] as const;

  const rowLabel = rowLabels[zone.row] ?? "Middle";
  const colLabel = colLabels[zone.col] ?? "Middle";
  const base = `${rowLabel}-${colLabel}`;

  return zone.kind === "OUT" ? `Out: ${base}` : base;
}

function missDirectionLabel(fromZoneId: string, toZoneId: string) {
  const from = zoneById.get(fromZoneId as ZoneId);
  const to = zoneById.get(toZoneId as ZoneId);
  if (!from || !to) return null;

  const rowDelta = to.row - from.row;
  const colDelta = to.col - from.col;
  if (rowDelta === 0 && colDelta === 0) return null;

  const vertical = rowDelta < 0 ? "High" : rowDelta > 0 ? "Low" : "";
  const horizontal = colDelta < 0 ? "Left" : colDelta > 0 ? "Right" : "";

  if (vertical && horizontal) return `${vertical}-${horizontal}`;
  return vertical || horizontal || null;
}

function formatTimestamp(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remaining = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function parseTimestampInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  const parts = trimmed.split(":").map((part) => part.trim());
  if (parts.some((part) => part === "" || !/^\d+$/.test(part))) return null;
  if (parts.length === 2) {
    const [mm, ss] = parts.map(Number);
    return mm * 60 + ss;
  }
  if (parts.length === 3) {
    const [hh, mm, ss] = parts.map(Number);
    return hh * 3600 + mm * 60 + ss;
  }
  return null;
}

function zoneIdToPoint(zoneId: ZoneId) {
  const zone = zoneById.get(zoneId);
  if (!zone) return { x: 0.5, y: 0.5 };
  return {
    x: (zone.col + 0.5) / 5,
    y: (zone.row + 0.5) / 5,
  };
}

function isYouTubeUrl(url: string) {
  return /youtube\.com|youtu\.be/.test(url);
}

function extractYouTubeId(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.replace("/", "");
      return id || null;
    }
    if (parsed.hostname.includes("youtube.com")) {
      if (parsed.pathname.startsWith("/shorts/")) {
        return parsed.pathname.split("/")[2] || null;
      }
      if (parsed.pathname.startsWith("/embed/")) {
        return parsed.pathname.split("/")[2] || null;
      }
      const id = parsed.searchParams.get("v");
      if (id) return id;
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeVideoUrl(url: string) {
  const trimmed = url.trim();
  const id = extractYouTubeId(trimmed);
  if (id) return `https://www.youtube.com/embed/${id}`;
  return trimmed;
}

function buildYouTubeEmbedUrl(url: string) {
  const normalized = normalizeVideoUrl(url);
  return normalized;
}

function buildYouTubeJumpUrl(url: string, seconds: number) {
  const id = extractYouTubeId(url);
  if (!id) return url;
  return `https://www.youtube.com/watch?v=${id}&t=${Math.floor(seconds)}s`;
}

function escapeCsv(value: unknown) {
  if (value === null || value === undefined) return "\"\"";
  const normalized = String(value).replace(/\r?\n/g, " ");
  return `"${normalized.replace(/\"/g, "\"\"")}"`;
}

function downloadCsv(csvText: string, filename: string) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function SessionSummaryPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params?.sessionId;

  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [pitches, setPitches] = useState<PitchRow[]>([]);
  const [sessionRow, setSessionRow] = useState<SessionRow | null>(null);
  const [pitcherRow, setPitcherRow] = useState<PitcherRow | null>(null);
  const [videoRow, setVideoRow] = useState<SessionVideoRow | null>(null);
  const [pitchEvents, setPitchEvents] = useState<PitchEventRow[]>([]);
  const [videoUrlInput, setVideoUrlInput] = useState<string>("");
  const [savingVideo, setSavingVideo] = useState(false);
  const [markingPitch, setMarkingPitch] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [timestampInput, setTimestampInput] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pitchTypeFilter, setPitchTypeFilter] = useState<string>("ALL");
  const [tagFilter, setTagFilter] = useState<string>("ALL");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [reviewOpenEventId, setReviewOpenEventId] = useState<string | null>(null);
  const [reviewForms, setReviewForms] = useState<Record<string, ReviewFormState>>({});
  const [reviewSaving, setReviewSaving] = useState<Record<string, boolean>>({});
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});

  const parsedTimestampSeconds = useMemo(() => {
    const parsed = parseTimestampInput(timestampInput);
    if (parsed === null || !Number.isFinite(parsed)) return null;
    return Math.max(0, Math.floor(parsed));
  }, [timestampInput]);

  function getReviewForm(eventId: string): ReviewFormState {
    return (
      reviewForms[eventId] ?? {
        pitch_type: "FB",
        intended_location_zone_id: null,
        actual_location_zone_id: null,
        tag: "",
        notes: "",
      }
    );
  }

  function updateReviewForm(eventId: string, next: Partial<ReviewFormState>) {
    setReviewForms((prev) => ({
      ...prev,
      [eventId]: { ...getReviewForm(eventId), ...next },
    }));
  }

  async function handleCreatePitchFromEvent(event: PitchEventRow) {
    if (!supabase || !sessionId) return;
    if (!authSession?.user?.id) {
      setReviewErrors((prev) => ({ ...prev, [event.id]: "Please sign in." }));
      return;
    }
    if (!sessionRow?.pitcher_id) {
      setReviewErrors((prev) => ({ ...prev, [event.id]: "Missing pitcher for this session." }));
      return;
    }

    const form = getReviewForm(event.id);
    if (!form.intended_location_zone_id || !form.actual_location_zone_id) {
      setReviewErrors((prev) => ({ ...prev, [event.id]: "Select intended and actual zones." }));
      return;
    }

    const target = zoneIdToPoint(form.intended_location_zone_id);
    const actual = zoneIdToPoint(form.actual_location_zone_id);
    const dx = actual.x - target.x;
    const dy = actual.y - target.y;

    setReviewSaving((prev) => ({ ...prev, [event.id]: true }));
    setReviewErrors((prev) => ({ ...prev, [event.id]: "" }));
    try {
      const { data, error } = await supabase
        .from("pitches")
        .insert({
          user_id: authSession.user.id,
          pitcher_id: sessionRow.pitcher_id,
          session_id: sessionId,
          pitch_type: form.pitch_type,
          tag: form.tag || null,
          intended_location_zone_id: form.intended_location_zone_id,
          actual_location_zone_id: form.actual_location_zone_id,
          target_x: target.x,
          target_y: target.y,
          actual_x: actual.x,
          actual_y: actual.y,
          dx,
          dy,
          notes: form.notes || null,
        })
        .select(
          "id,pitch_type,tag,intended_location_zone_id,actual_location_zone_id,notes,created_at"
        )
        .single();
      if (error) throw error;
      if (data) {
        const newPitch = data as PitchRow;
        setPitches((prev) => [newPitch, ...prev]);
        const { error: linkError } = await supabase
          .from("pitch_events")
          .update({ pitch_id: newPitch.id })
          .eq("id", event.id)
          .eq("user_id", authSession.user.id);
        if (linkError) throw linkError;

        setPitchEvents((prev) =>
          prev.map((row) => (row.id === event.id ? { ...row, pitch_id: newPitch.id } : row))
        );
        setReviewOpenEventId(null);
      }
    } catch (e) {
      console.error(e);
      setReviewErrors((prev) => ({
        ...prev,
        [event.id]: "Save failed. This may be due to Supabase RLS policies.",
      }));
    } finally {
      setReviewSaving((prev) => ({ ...prev, [event.id]: false }));
    }
  }

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error(error);
        return;
      }
      setAuthSession(data.session ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setAuthSession(nextSession);
    });

    return () => {
      sub?.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    if (!supabase) return;

    setLoading(true);
    setErrorMessage(null);

    const load = async () => {
      try {
        const { data: pitchesData, error: pitchesError } = await supabase
          .from("pitches")
          .select("id,pitch_type,tag,intended_location_zone_id,actual_location_zone_id,notes,created_at")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: false });

        if (pitchesError) throw pitchesError;
        setPitches((pitchesData ?? []) as PitchRow[]);

        const { data: sessionData, error: sessionError } = await supabase
          .from("sessions")
          .select("id,session_date,label,pitcher_id,created_at")
          .eq("id", sessionId)
          .single();

        if (sessionError) {
          console.error(sessionError);
        } else {
          const row = sessionData as SessionRow;
          setSessionRow(row);

          if (row.pitcher_id) {
            const { data: pitcherData, error: pitcherError } = await supabase
              .from("pitchers")
              .select("id,name")
              .eq("id", row.pitcher_id)
              .single();
            if (pitcherError) {
              console.error(pitcherError);
            } else {
              setPitcherRow(pitcherData as PitcherRow);
            }
          } else {
            setPitcherRow(null);
          }
        }
      } catch (e: unknown) {
        console.error(e);
        setErrorMessage("Failed to load session data");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [sessionId]);

  async function loadVideoAndEvents() {
    if (!sessionId || !supabase) return;
    try {
      const { data: videoData, error: videoError } = await supabase
        .from("session_videos")
        .select("id,session_id,video_url,original_filename,created_at")
        .eq("session_id", sessionId)
        .maybeSingle();

      if (videoError) {
        console.error(
          "supabase error",
          videoError.message,
          videoError.details,
          videoError.hint,
          videoError.code
        );
        setStatusMessage(videoError.message);
        throw videoError;
      }
      const video = (videoData ?? null) as SessionVideoRow | null;
      setVideoRow(video);
      if (video?.video_url) {
        setVideoUrlInput(video.video_url);
      }

      if (video?.id) {
        const { data: eventsData, error: eventsError } = await supabase
          .from("pitch_events")
          .select("id,session_id,video_id,timestamp_seconds,pitch_id,created_at")
          .eq("session_id", sessionId)
          .eq("video_id", video.id)
          .order("timestamp_seconds", { ascending: true });
        if (eventsError) {
          console.error(
            "supabase error",
            eventsError.message,
            eventsError.details,
            eventsError.hint,
            eventsError.code
          );
          setStatusMessage(eventsError.message);
          throw eventsError;
        }
        setPitchEvents((eventsData ?? []) as PitchEventRow[]);
      } else {
        setPitchEvents([]);
      }
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    if (!sessionId) return;
    loadVideoAndEvents();
  }, [sessionId]);

  async function handleSaveVideoUrl() {
    if (!supabase || !sessionId) return;
    if (!videoUrlInput.trim()) {
      setStatusMessage("Paste a video URL first.");
      return;
    }
    if (!authSession?.user?.id) {
      setStatusMessage("Please sign in.");
      return;
    }

    setSavingVideo(true);
    setStatusMessage(null);
    try {
      const url = normalizeVideoUrl(videoUrlInput);
      const { error: upsertError } = await supabase
        .from("session_videos")
        .upsert(
          {
            session_id: sessionId,
            video_url: url,
            original_filename: null,
            user_id: authSession.user.id,
          },
          { onConflict: "session_id" }
        );
      if (upsertError) {
        console.error(
          "supabase error",
          upsertError.message,
          upsertError.details,
          upsertError.hint,
          upsertError.code
        );
        setStatusMessage(upsertError.message);
        throw upsertError;
      }

      setStatusMessage("Video link saved.");
      await loadVideoAndEvents();
    } catch (e) {
      console.error(e);
      setStatusMessage("Save failed. This may be due to Supabase RLS policies.");
    } finally {
      setSavingVideo(false);
    }
  }

  async function handleMarkPitch() {
    if (!supabase || !sessionId || !videoRow) return;
    if (!authSession?.user?.id) {
      setStatusMessage("Sign in to mark pitches.");
      return;
    }

    setMarkingPitch(true);
    setStatusMessage(null);
    try {
      const timestampSeconds = parsedTimestampSeconds;
      if (timestampSeconds === null || timestampSeconds <= 0) {
        setStatusMessage("Enter a valid timestamp in seconds.");
        return;
      }
      const { error } = await supabase.from("pitch_events").insert({
        session_id: sessionId,
        video_id: videoRow.id,
        timestamp_seconds: timestampSeconds,
        pitch_id: null,
        user_id: authSession.user.id,
      });
      if (error) throw error;

      setStatusMessage("Pitch marked.");
      await loadVideoAndEvents();
    } catch (e) {
      console.error(e);
      setStatusMessage("Mark failed. This may be due to Supabase RLS policies.");
    } finally {
      setMarkingPitch(false);
    }
  }

  function handleJumpToEvent(seconds: number) {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    videoEl.currentTime = seconds;
    videoEl.play().catch(() => undefined);
  }

  const availablePitchTypes = useMemo(() => {
    const set = new Set<string>();
    for (const p of pitches) set.add(p.pitch_type);
    return Array.from(set).sort();
  }, [pitches]);

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of pitches) {
      if (p.tag) set.add(p.tag);
    }
    return Array.from(set).sort();
  }, [pitches]);

  const filteredPitches = useMemo(() => {
    let result = pitches;
    if (pitchTypeFilter !== "ALL") {
      result = result.filter((p) => p.pitch_type === pitchTypeFilter);
    }
    if (tagFilter !== "ALL") {
      result = result.filter((p) => (p.tag ?? "") === tagFilter);
    }
    return result;
  }, [pitches, pitchTypeFilter, tagFilter]);

  const stats = useMemo(() => computeSummaryStats(filteredPitches), [filteredPitches]);
  const actualCounts = useMemo(
    () => computeZoneCounts(filteredPitches, "actual_location_zone_id"),
    [filteredPitches]
  );
  const intendedCounts = useMemo(
    () => computeZoneCounts(filteredPitches, "intended_location_zone_id"),
    [filteredPitches]
  );

  const pitchTypeBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const pitch of filteredPitches) {
      const key = pitch.pitch_type || "Unknown";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredPitches]);

  const topMissedZones = useMemo(() => {
    const counts = new Map<string, number>();
    for (const pitch of filteredPitches) {
      const intended = pitch.intended_location_zone_id;
      const actual = pitch.actual_location_zone_id;
      if (!actual || !intended || actual === intended) continue;
      counts.set(actual, (counts.get(actual) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([zoneId, count]) => ({
        zoneId,
        label: friendlyZoneLabel(zoneId),
        count,
      }));
  }, [filteredPitches]);

  const sessionDateLabel = useMemo(() => {
    if (!sessionRow) return sessionId ?? "—";
    const raw = sessionRow.session_date || sessionRow.created_at;
    if (!raw) return sessionId ?? "—";
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? sessionId ?? "—" : date.toLocaleDateString();
  }, [sessionRow, sessionId]);

  const coachingInsights = useMemo(() => {
    const insights: string[] = [];
    const total = stats.total;

    if (total === 0) {
      return ["Add pitches to generate coaching insights."];
    }

    const missDirections = new Map<string, number>();
    const accuracyByType = new Map<string, { total: number; hits: number }>();

    for (const pitch of filteredPitches) {
      const typeKey = pitch.pitch_type || "Unknown";
      const entry = accuracyByType.get(typeKey) ?? { total: 0, hits: 0 };
      entry.total += 1;
      if (
        pitch.intended_location_zone_id &&
        pitch.actual_location_zone_id &&
        pitch.intended_location_zone_id === pitch.actual_location_zone_id
      ) {
        entry.hits += 1;
      }
      accuracyByType.set(typeKey, entry);

      if (
        pitch.intended_location_zone_id &&
        pitch.actual_location_zone_id &&
        pitch.intended_location_zone_id !== pitch.actual_location_zone_id
      ) {
        const label = missDirectionLabel(
          pitch.intended_location_zone_id,
          pitch.actual_location_zone_id
        );
        if (label) {
          missDirections.set(label, (missDirections.get(label) ?? 0) + 1);
        }
      }
    }

    const missTotal = Array.from(missDirections.values()).reduce((sum, n) => sum + n, 0);
    if (missTotal >= 3) {
      const top = Array.from(missDirections.entries()).sort((a, b) => b[1] - a[1])[0];
      if (top) {
        insights.push(`Misses most often finished ${top[0].toLowerCase()} of target.`);
      }
    } else {
      insights.push("Miss direction is still mixed; no clear pattern yet.");
    }

    if (stats.inZoneRate >= 0.6) {
      insights.push("Zone discipline is strong; keep attacking the strike zone.");
    } else if (stats.inZoneRate >= 0.4) {
      insights.push("Zone discipline is mixed; tighten misses just off the plate.");
    } else {
      insights.push("Zone discipline needs attention; prioritize strikes early in counts.");
    }

    const accuracyRows = Array.from(accuracyByType.entries())
      .filter(([, row]) => row.total > 0)
      .map(([type, row]) => ({ type, rate: row.hits / row.total, total: row.total }))
      .sort((a, b) => b.rate - a.rate);

    if (accuracyRows.length > 1) {
      const best = accuracyRows[0];
      const worst = accuracyRows[accuracyRows.length - 1];
      insights.push(
        `Best command: ${best.type} (${Math.round(best.rate * 100)}% on target).`
      );
      insights.push(
        `Needs the most command work: ${worst.type} (${Math.round(worst.rate * 100)}% on target).`
      );
    } else if (accuracyRows.length === 1) {
      const only = accuracyRows[0];
      insights.push(`Command on ${only.type}: ${Math.round(only.rate * 100)}% on target.`);
    }

    if (total < 8) {
      insights.push("Small sample size—treat these as early reads.");
    }

    return insights;
  }, [filteredPitches, stats]);

  const csvFilename = useMemo(() => {
    const raw = sessionRow?.session_date || sessionRow?.created_at;
    const date = raw ? new Date(raw) : new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const safeSessionId = sessionId ?? "unknown";
    return `bullpen_session_${safeSessionId}_${yyyy}-${mm}-${dd}.csv`;
  }, [sessionRow, sessionId]);

  const csvText = useMemo(() => {
    const header = [
      "session_id",
      "session_date",
      "pitcher_name",
      "pitch_id",
      "created_at",
      "pitch_type",
      "intended_zone_label",
      "actual_zone_label",
      "intended_location_zone_id",
      "actual_location_zone_id",
      "notes",
    ];

    const rows = filteredPitches.map((pitch) => {
      return [
        sessionId ?? "",
        sessionRow?.session_date ?? "",
        pitcherRow?.name ?? "",
        pitch.id,
        pitch.created_at ?? "",
        pitch.pitch_type ?? "",
        friendlyZoneLabel(pitch.intended_location_zone_id),
        friendlyZoneLabel(pitch.actual_location_zone_id),
        pitch.intended_location_zone_id ?? "",
        pitch.actual_location_zone_id ?? "",
        pitch.notes ?? "",
      ];
    });

    return [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
  }, [filteredPitches, sessionId, sessionRow, pitcherRow]);

  function handleExportPdf() {
    if (!sessionId) return;
    const params = new URLSearchParams();
    if (pitchTypeFilter !== "ALL") {
      params.set("pitchType", pitchTypeFilter);
    }
    const qs = params.toString();
    const url = qs ? `/sessions/${sessionId}/print?${qs}` : `/sessions/${sessionId}/print`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="min-h-screen p-6 flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Session Summary</h1>
            <div className="text-sm text-gray-600">Session: {sessionDateLabel}</div>
            {pitcherRow?.name ? (
              <div className="text-sm text-gray-600">Pitcher: {pitcherRow.name}</div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => downloadCsv(csvText, csvFilename)}
              disabled={!filteredPitches.length}
            >
              Export CSV
            </Button>
            <Button variant="outline" onClick={handleExportPdf} disabled={!sessionId}>
              Export PDF
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Back to Home</Link>
            </Button>
          </div>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4 items-end">
          <div className="md:col-span-1">
            <Label className="block text-sm font-medium mb-1">Pitch type</Label>
            <Select value={pitchTypeFilter} onValueChange={setPitchTypeFilter}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                {availablePitchTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-1">
            <Label className="block text-sm font-medium mb-1">Tag</Label>
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                {availableTags.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Session video</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
          {!videoRow ? (
            <div className="space-y-3">
              <div className="grid gap-2 md:grid-cols-[1fr_auto] items-center">
                <Input
                  type="url"
                  placeholder="Paste video URL"
                  value={videoUrlInput}
                  onChange={(e) => setVideoUrlInput(e.target.value)}
                />
                <Button
                  onClick={handleSaveVideoUrl}
                  disabled={savingVideo || !videoUrlInput.trim() || !authSession?.user?.id}
                >
                  {savingVideo ? "Saving…" : "Save Video Link"}
                </Button>
              </div>
              <div className="text-xs text-gray-500">Save one hosted video URL per session.</div>
              {!authSession?.user?.id ? (
                <div className="text-xs text-amber-700">Please sign in to save a video link.</div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              {videoRow?.video_url ? (
                isYouTubeUrl(videoRow.video_url) ? (
                  <iframe
                    className="w-full aspect-video rounded-lg border"
                    src={buildYouTubeEmbedUrl(videoRow.video_url)}
                    title="Session video"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <video
                    ref={videoRef}
                    src={videoRow.video_url}
                    controls
                    className="w-full rounded-lg border"
                  />
                )
              ) : (
                <div className="text-sm text-gray-600">Add a video link to start.</div>
              )}
              <div className="grid gap-2 md:grid-cols-[1fr_auto_auto] items-center">
                <Input
                  type="url"
                  placeholder="Paste video URL"
                  value={videoUrlInput}
                  onChange={(e) => setVideoUrlInput(e.target.value)}
                />
                <Button
                  onClick={handleSaveVideoUrl}
                  disabled={savingVideo || !videoUrlInput.trim() || !authSession?.user?.id}
                  variant="outline"
                >
                  {savingVideo ? "Saving…" : "Change Video Link"}
                </Button>
                <Button
                  onClick={handleMarkPitch}
                  disabled={!videoRow?.video_url || markingPitch || !parsedTimestampSeconds || parsedTimestampSeconds === 0}
                >
                  {markingPitch ? "Marking…" : "Mark pitch"}
                </Button>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="timestamp-input" className="text-sm font-medium text-gray-700">
                  Timestamp
                </Label>
                <Input
                  id="timestamp-input"
                  type="text"
                  value={timestampInput}
                  onChange={(e) => setTimestampInput(e.target.value)}
                  placeholder="e.g., 45, 1:30, or 1:30:45"
                  aria-describedby="timestamp-help timestamp-preview"
                />
                <div id="timestamp-help" className="text-xs text-gray-500">
                  Enter seconds (45), mm:ss (1:30), or hh:mm:ss (1:30:45)
                </div>
                <div id="timestamp-preview" className="text-xs text-gray-600 font-medium">
                  Preview: {parsedTimestampSeconds !== null ? formatTimestamp(parsedTimestampSeconds) : "Invalid format"}
                </div>
                {parsedTimestampSeconds === 0 ? (
                  <div className="text-xs text-amber-700" role="alert">Timestamp must be greater than 0.</div>
                ) : null}
              </div>
            </div>
          )}

          {statusMessage ? <div className="text-xs text-gray-600">{statusMessage}</div> : null}

          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700">Marked pitches</div>
            {!pitchEvents.length ? (
              <div className="text-sm text-gray-500">No marked pitches yet.</div>
            ) : (
              <div className="space-y-2">
                {pitchEvents.map((event, idx) => (
                  <div
                    key={event.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="font-mono text-gray-500">#{idx + 1}</div>
                      <div className="font-medium">{formatTimestamp(event.timestamp_seconds)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {videoRow?.video_url && !isYouTubeUrl(videoRow.video_url) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleJumpToEvent(event.timestamp_seconds)}
                        >
                          Jump
                        </Button>
                      ) : null}
                      {videoRow?.video_url && isYouTubeUrl(videoRow.video_url) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            window.open(buildYouTubeJumpUrl(videoRow.video_url, event.timestamp_seconds), "_blank")
                          }
                        >
                          Open at time
                        </Button>
                      ) : null}
                      {event.pitch_id ? (
                        <span className="text-xs text-green-700">Linked</span>
                      ) : (
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/?sessionId=${sessionId}&eventId=${event.id}&timestamp=${Math.floor(
                              event.timestamp_seconds
                            )}`}
                          >
                            Link to a pitch
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="text-xs text-gray-500">
              Mark pitches, then link each event to a new pitch from the main page.
            </div>
          </div>
        </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Review Queue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!pitchEvents.length ? (
                <div className="text-sm text-gray-500">No marked events yet.</div>
              ) : (
                <div className="space-y-3">
                  {pitchEvents.map((event) => {
                    const isLinked = Boolean(event.pitch_id);
                    const isOpen = reviewOpenEventId === event.id;
                    const form = getReviewForm(event.id);
                    const saving = Boolean(reviewSaving[event.id]);
                    const error = reviewErrors[event.id];

                    return (
                      <div key={event.id} className="rounded-lg border p-3 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="font-mono text-gray-500">{formatTimestamp(event.timestamp_seconds)}</div>
                            <span
                              className={`text-xs rounded-full px-2 py-0.5 ${
                                isLinked ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {isLinked ? "Linked" : "Unlinked"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {videoRow?.video_url && isYouTubeUrl(videoRow.video_url) ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  window.open(buildYouTubeJumpUrl(videoRow.video_url, event.timestamp_seconds), "_blank")
                                }
                              >
                                Open video at time
                              </Button>
                            ) : videoRow?.video_url ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleJumpToEvent(event.timestamp_seconds)}
                              >
                                Jump
                              </Button>
                            ) : null}
                            {!isLinked && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setReviewOpenEventId(isOpen ? null : event.id)}
                              >
                                {isOpen ? "Collapse" : "Create pitch"}
                              </Button>
                            )}
                          </div>
                        </div>

                        {!isLinked && isOpen && (
                          <div className="space-y-3">
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-2">
                                <Label className="block text-sm font-medium">Pitch type</Label>
                                <Select
                                  value={form.pitch_type}
                                  onValueChange={(value) => updateReviewForm(event.id, { pitch_type: value })}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {PITCH_TYPE_OPTIONS.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label className="block text-sm font-medium">Tag (optional)</Label>
                                <Input
                                  value={form.tag}
                                  onChange={(e) => updateReviewForm(event.id, { tag: e.target.value })}
                                  placeholder="Example: miss up, good feel"
                                />
                              </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                              <StrikeZoneGrid
                                label="Intended location"
                                value={form.intended_location_zone_id}
                                onSelect={(zoneId) => updateReviewForm(event.id, { intended_location_zone_id: zoneId })}
                              />
                              <StrikeZoneGrid
                                label="Actual location"
                                value={form.actual_location_zone_id}
                                onSelect={(zoneId) => updateReviewForm(event.id, { actual_location_zone_id: zoneId })}
                              />
                            </div>

                            <div className="space-y-2">
                              <Label className="block text-sm font-medium">Notes (optional)</Label>
                              <Textarea
                                value={form.notes}
                                onChange={(e) => updateReviewForm(event.id, { notes: e.target.value })}
                                className="min-h-[80px]"
                                placeholder="Example: missed arm-side"
                              />
                            </div>

                            {error ? <div className="text-xs text-red-600">{error}</div> : null}

                            <div className="flex items-center gap-2">
                              <Button
                                onClick={() => handleCreatePitchFromEvent(event)}
                                disabled={saving}
                              >
                                {saving ? "Saving…" : "Save pitch"}
                              </Button>
                              <Button variant="outline" onClick={() => setReviewOpenEventId(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {loading ? (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <SkeletonCard className="h-32" />
                <SkeletonCard className="h-32" />
              </div>
              <SkeletonCard className="h-24" />
              <div className="grid gap-6 md:grid-cols-2">
                <SkeletonHeatmap />
                <SkeletonHeatmap />
              </div>
              <SkeletonPitchList count={5} />
            </div>
          ) : errorMessage ? (
        <div className="text-sm text-red-600">{errorMessage}</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Total pitches</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">{stats.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>In-zone rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">{Math.round(stats.inZoneRate * 100)}%</div>
                <div className="text-xs text-gray-500">{stats.inZoneCount} in-zone</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Accuracy rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">{Math.round(stats.accuracyRate * 100)}%</div>
                <div className="text-xs text-gray-500">{stats.accuracyCount} matched intended</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Pitch type breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {pitchTypeBreakdown.length ? (
                  <div className="space-y-2 text-sm">
                    {pitchTypeBreakdown.map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between">
                        <span className="font-medium">{type}</span>
                        <span className="text-gray-600">{count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">No pitches yet.</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Top missed zones</CardTitle>
              </CardHeader>
              <CardContent>
                {topMissedZones.length ? (
                  <div className="space-y-2 text-sm">
                    {topMissedZones.map((zone) => (
                      <div key={zone.zoneId} className="flex items-center justify-between">
                        <span className="font-medium">{zone.label}</span>
                        <span className="text-gray-600">{zone.count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">No misses yet.</div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Coaching Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-gray-700">
                {coachingInsights.map((insight, idx) => (
                  <p key={`insight-${idx}`}>{insight}</p>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <StrikeZoneHeatmap title="Intended Location" counts={intendedCounts} />
            <StrikeZoneHeatmap title="Actual Location" counts={actualCounts} />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Pitches</CardTitle>
            </CardHeader>
            <CardContent>
              {!filteredPitches.length ? (
                <div className="text-sm text-gray-500">No pitches match the current filters.</div>
              ) : (
                <div className="divide-y rounded-lg border">
                  {filteredPitches.slice(0, 25).map((pitch, idx) => (
                    <div key={pitch.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div className="flex items-center gap-3">
                        <div className="font-mono text-gray-500">#{idx + 1}</div>
                        <div className="font-medium">{pitch.pitch_type}</div>
                        {pitch.tag ? (
                          <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                            {pitch.tag}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-gray-500">
                        {pitch.created_at ? new Date(pitch.created_at).toLocaleTimeString() : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
