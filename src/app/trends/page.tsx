"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { computeSummaryStats, isInZone } from "@/lib/strikeZone";

type PitcherRow = {
  id: string;
  name: string;
};

type SessionRow = {
  id: string;
  session_date: string | null;
  label: string | null;
  pitcher_id: string | null;
  created_at: string;
};

type PitchRow = {
  id: string;
  session_id: string;
  pitch_type: string;
  intended_location_zone_id: string | null;
  actual_location_zone_id: string | null;
  dx: number | null;
  dy: number | null;
};

type SessionMetrics = {
  sessionId: string;
  label: string;
  total: number;
  inZoneRate: number;
  accuracyRate: number;
  avgMissDist: number;
  outOfZoneRate: number;
};

function formatSessionLabel(session: SessionRow) {
  const raw = session.session_date || session.created_at;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return session.id.slice(0, 6);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function LineChart({ title, values, labels }: { title: string; values: number[]; labels: string[] }) {
  const width = 520;
  const height = 140;
  const padding = 20;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const points = values.map((v, idx) => {
    const x = padding + (idx / Math.max(values.length - 1, 1)) * (width - padding * 2);
    const y = padding + (1 - (v - min) / span) * (height - padding * 2);
    return { x, y, v, label: labels[idx] };
  });

  const path = points
    .map((p, idx) => `${idx === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-700">{title}</div>
        <div className="text-xs text-gray-500">
          Latest: {values.length ? Math.round(values[values.length - 1] * 100) : 0}%
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-36" role="img" aria-label={title}>
        <rect x="0" y="0" width={width} height={height} fill="white" />
        <path d={path} fill="none" stroke="#111827" strokeWidth="2" />
        {points.map((p, idx) => (
          <circle key={`${title}-${idx}`} cx={p.x} cy={p.y} r={3.5} fill="#111827" />
        ))}
      </svg>
      <div className="flex justify-between text-[11px] text-gray-500">
        <span>{labels[0] ?? ""}</span>
        <span>{labels[labels.length - 1] ?? ""}</span>
      </div>
    </div>
  );
}

function BarChart({ title, values, labels }: { title: string; values: number[]; labels: string[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-700">{title}</div>
        <div className="text-xs text-gray-500">Max: {max}</div>
      </div>
      <div className="flex items-end gap-2 h-32">
        {values.map((v, idx) => (
          <div key={`${title}-${idx}`} className="flex-1 flex flex-col items-center gap-2">
            <div
              className="w-full rounded bg-gray-800"
              style={{ height: `${(v / max) * 100}%`, minHeight: v ? "6px" : "2px" }}
              title={`${labels[idx]}: ${v}`}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-gray-500">
        <span>{labels[0] ?? ""}</span>
        <span>{labels[labels.length - 1] ?? ""}</span>
      </div>
    </div>
  );
}

export default function TrendsPage() {
  const supabaseReady = Boolean(supabase);
  const [pitchers, setPitchers] = useState<PitcherRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [pitches, setPitches] = useState<PitchRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedPitcherId, setSelectedPitcherId] = useState<string>("ALL");
  const [pitchTypeFilter, setPitchTypeFilter] = useState<string>("ALL");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  useEffect(() => {
    if (!supabase) return;

    const loadPitchers = async () => {
      try {
        const { data, error } = await supabase
          .from("pitchers")
          .select("id,name")
          .order("created_at", { ascending: false });
        if (error) throw error;
        setPitchers((data ?? []) as PitcherRow[]);
      } catch (e) {
        console.error(e);
      }
    };

    loadPitchers();
  }, []);

  useEffect(() => {
    if (!supabase) return;

    const loadSessionsAndPitches = async () => {
      setLoading(true);
      try {
        let sessionsQuery = supabase
          .from("sessions")
          .select("id,session_date,label,pitcher_id,created_at")
          .order("session_date", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true });

        if (selectedPitcherId !== "ALL") {
          sessionsQuery = sessionsQuery.eq("pitcher_id", selectedPitcherId);
        }
        if (dateFrom) {
          sessionsQuery = sessionsQuery.gte("session_date", dateFrom);
        }
        if (dateTo) {
          sessionsQuery = sessionsQuery.lte("session_date", dateTo);
        }

        const { data: sessionsData, error: sessionsError } = await sessionsQuery;
        if (sessionsError) throw sessionsError;

        const sessionRows = (sessionsData ?? []) as SessionRow[];
        setSessions(sessionRows);

        const sessionIds = sessionRows.map((s) => s.id);
        if (!sessionIds.length) {
          setPitches([]);
          return;
        }

        const { data: pitchesData, error: pitchesError } = await supabase
          .from("pitches")
          .select(
            "id,session_id,pitch_type,intended_location_zone_id,actual_location_zone_id,dx,dy"
          )
          .in("session_id", sessionIds);
        if (pitchesError) throw pitchesError;

        setPitches((pitchesData ?? []) as PitchRow[]);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    loadSessionsAndPitches();
  }, [selectedPitcherId, dateFrom, dateTo]);

  const availablePitchTypes = useMemo(() => {
    const set = new Set<string>();
    for (const p of pitches) set.add(p.pitch_type);
    return Array.from(set).sort();
  }, [pitches]);

  const sessionMetrics = useMemo(() => {
    const pitchesBySession = new Map<string, PitchRow[]>();
    for (const pitch of pitches) {
      if (pitchTypeFilter !== "ALL" && pitch.pitch_type !== pitchTypeFilter) continue;
      const list = pitchesBySession.get(pitch.session_id) ?? [];
      list.push(pitch);
      pitchesBySession.set(pitch.session_id, list);
    }

    const metrics: SessionMetrics[] = [];
    const sessionsSorted = [...sessions].sort((a, b) => {
      const aDate = new Date(a.session_date || a.created_at).getTime();
      const bDate = new Date(b.session_date || b.created_at).getTime();
      return aDate - bDate;
    });

    for (const session of sessionsSorted) {
      const list = pitchesBySession.get(session.id) ?? [];
      const stats = computeSummaryStats(list);
      const total = stats.total;
      let missSum = 0;
      let missCount = 0;
      let outCount = 0;

      for (const pitch of list) {
        const dx = pitch.dx ?? 0;
        const dy = pitch.dy ?? 0;
        missSum += Math.sqrt(dx * dx + dy * dy);
        missCount += 1;
        if (!isInZone(pitch.actual_location_zone_id)) outCount += 1;
      }

      metrics.push({
        sessionId: session.id,
        label: formatSessionLabel(session),
        total,
        inZoneRate: stats.inZoneRate,
        accuracyRate: stats.accuracyRate,
        avgMissDist: missCount ? missSum / missCount : 0,
        outOfZoneRate: total ? outCount / total : 0,
      });
    }

    return metrics;
  }, [sessions, pitches, pitchTypeFilter]);

  const totalBySession = sessionMetrics.map((m) => m.total);
  const inZoneBySession = sessionMetrics.map((m) => m.inZoneRate);
  const accuracyBySession = sessionMetrics.map((m) => m.accuracyRate);
  const avgMissBySession = sessionMetrics.map((m) => m.avgMissDist);
  const labels = sessionMetrics.map((m) => m.label);

  const overallStats = useMemo(() => {
    const all = pitches.filter((p) => pitchTypeFilter === "ALL" || p.pitch_type === pitchTypeFilter);
    const stats = computeSummaryStats(all);
    let missSum = 0;
    let missCount = 0;
    let outCount = 0;

    for (const pitch of all) {
      const dx = pitch.dx ?? 0;
      const dy = pitch.dy ?? 0;
      missSum += Math.sqrt(dx * dx + dy * dy);
      missCount += 1;
      if (!isInZone(pitch.actual_location_zone_id)) outCount += 1;
    }

    return {
      total: stats.total,
      inZoneRate: stats.inZoneRate,
      accuracyRate: stats.accuracyRate,
      avgMissDist: missCount ? missSum / missCount : 0,
      outOfZoneRate: stats.total ? outCount / stats.total : 0,
    };
  }, [pitches, pitchTypeFilter]);

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

      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold">Multi-Session Trends</h1>
            <p className="text-gray-600">Zone-based trends across sessions.</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/">Back to Home</Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4 items-end">
          <div className="md:col-span-1">
            <Label className="block text-sm font-medium mb-1">Pitcher</Label>
            <Select value={selectedPitcherId} onValueChange={setSelectedPitcherId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All pitchers</SelectItem>
                {pitchers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
            <Label className="block text-sm font-medium mb-1">From</Label>
            <Input value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} type="date" />
          </div>
          <div className="md:col-span-1">
            <Label className="block text-sm font-medium mb-1">To</Label>
            <Input value={dateTo} onChange={(e) => setDateTo(e.target.value)} type="date" />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-sm text-gray-600">Loading trends…</div>
      ) : !sessionMetrics.length ? (
        <div className="text-sm text-gray-600">No sessions found for these filters.</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Total pitches</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">{overallStats.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>In-zone rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">{Math.round(overallStats.inZoneRate * 100)}%</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Accuracy rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">{Math.round(overallStats.accuracyRate * 100)}%</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Avg miss distance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">{overallStats.avgMissDist.toFixed(3)}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Pitches per session</CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart title="Total pitches" values={totalBySession} labels={labels} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle>In-zone rate by session</CardTitle>
              </CardHeader>
              <CardContent>
                <LineChart title="In-zone rate" values={inZoneBySession} labels={labels} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Accuracy rate by session</CardTitle>
              </CardHeader>
              <CardContent>
                <LineChart title="Accuracy rate" values={accuracyBySession} labels={labels} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Average miss distance</CardTitle>
              </CardHeader>
              <CardContent>
                <LineChart
                  title="Average miss distance"
                  values={avgMissBySession}
                  labels={labels}
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </main>
  );
}
