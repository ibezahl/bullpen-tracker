"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StrikeZoneHeatmap } from "@/components/StrikeZoneHeatmap";
import { buildZones5x5, computeSummaryStats, computeZoneCounts, type ZoneId } from "@/lib/strikeZone";

type PitchRow = {
  id: string;
  pitch_type: string;
  intended_location_zone_id: string | null;
  actual_location_zone_id: string | null;
  notes: string | null;
  created_at: string | null;
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const zones5x5 = buildZones5x5();
const zoneById = new Map(zones5x5.map((zone) => [zone.id, zone]));

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

  const [pitches, setPitches] = useState<PitchRow[]>([]);
  const [sessionRow, setSessionRow] = useState<SessionRow | null>(null);
  const [pitcherRow, setPitcherRow] = useState<PitcherRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pitchTypeFilter, setPitchTypeFilter] = useState<string>("ALL");

  useEffect(() => {
    if (!sessionId) return;
    if (!supabase) return;

    setLoading(true);
    setErrorMessage(null);

    const load = async () => {
      try {
        const { data: pitchesData, error: pitchesError } = await supabase
          .from("pitches")
          .select("id,pitch_type,intended_location_zone_id,actual_location_zone_id,notes,created_at")
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

  const availablePitchTypes = useMemo(() => {
    const set = new Set<string>();
    for (const p of pitches) set.add(p.pitch_type);
    return Array.from(set).sort();
  }, [pitches]);

  const filteredPitches = useMemo(() => {
    if (pitchTypeFilter === "ALL") return pitches;
    return pitches.filter((p) => p.pitch_type === pitchTypeFilter);
  }, [pitches, pitchTypeFilter]);

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
        <CardContent className="grid gap-3 md:grid-cols-3 items-end">
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
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-sm text-gray-600">Loading session pitches…</div>
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
        </>
      )}
    </main>
  );
}
