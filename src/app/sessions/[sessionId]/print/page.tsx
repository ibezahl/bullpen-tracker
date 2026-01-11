"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StrikeZoneHeatmap } from "@/components/StrikeZoneHeatmap";
import { buildZones5x5, computeSummaryStats, computeZoneCounts, type ZoneId } from "@/lib/strikeZone";

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

type PitchRow = {
  id: string;
  pitch_type: string;
  intended_location_zone_id: string | null;
  actual_location_zone_id: string | null;
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

export default function SessionSummaryPrintPage() {
  const params = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const sessionId = params?.sessionId;
  const pitchTypeParam = searchParams.get("pitchType") ?? "ALL";

  const [pitches, setPitches] = useState<PitchRow[]>([]);
  const [sessionRow, setSessionRow] = useState<SessionRow | null>(null);
  const [pitcherRow, setPitcherRow] = useState<PitcherRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    if (!supabase) return;

    const load = async () => {
      setLoading(true);
      try {
        const { data: pitchesData, error: pitchesError } = await supabase
          .from("pitches")
          .select("id,pitch_type,intended_location_zone_id,actual_location_zone_id")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: false });

        if (pitchesError) throw pitchesError;
        setPitches((pitchesData ?? []) as PitchRow[]);

        const { data: sessionData, error: sessionError } = await supabase
          .from("sessions")
          .select("id,session_date,label,pitcher_id,created_at")
          .eq("id", sessionId)
          .single();

        if (!sessionError && sessionData) {
          const row = sessionData as SessionRow;
          setSessionRow(row);

          if (row.pitcher_id) {
            const { data: pitcherData, error: pitcherError } = await supabase
              .from("pitchers")
              .select("id,name")
              .eq("id", row.pitcher_id)
              .single();
            if (!pitcherError && pitcherData) {
              setPitcherRow(pitcherData as PitcherRow);
            }
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [sessionId]);

  useEffect(() => {
    if (printed || loading) return;
    if (!sessionId) return;
    const id = window.setTimeout(() => {
      window.print();
      setPrinted(true);
    }, 300);
    return () => window.clearTimeout(id);
  }, [printed, loading, sessionId]);

  const filteredPitches = useMemo(() => {
    if (!pitchTypeParam || pitchTypeParam === "ALL") return pitches;
    return pitches.filter((p) => p.pitch_type === pitchTypeParam);
  }, [pitches, pitchTypeParam]);

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

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <style>{`
        .print-container {
          max-width: 980px;
          margin: 0 auto;
          padding: 24px;
        }
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background: white;
          }
          .no-print {
            display: none !important;
          }
          .avoid-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .print-container {
            padding: 0;
          }
        }
      `}</style>

      <div className="print-container flex flex-col gap-6">
        <div className="no-print flex items-center justify-between">
          <div className="text-sm text-gray-600">Print-friendly view</div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              Print / Save as PDF
            </Button>
            <Button asChild variant="outline">
              <Link href={`/sessions/${sessionId}`}>Back to Summary</Link>
            </Button>
          </div>
        </div>

        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold">Bullpen Session Summary</h1>
          <div className="text-sm text-gray-600">Session: {sessionDateLabel}</div>
          {pitcherRow?.name ? (
            <div className="text-sm text-gray-600">Pitcher: {pitcherRow.name}</div>
          ) : null}
          {pitchTypeParam && pitchTypeParam !== "ALL" ? (
            <div className="text-sm text-gray-600">Pitch type: {pitchTypeParam}</div>
          ) : null}
        </header>

        {loading ? (
          <div className="text-sm text-gray-600">Loading session data…</div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="avoid-break">
                <CardHeader className="pb-2">
                  <CardTitle>Total pitches</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">{stats.total}</div>
                </CardContent>
              </Card>
              <Card className="avoid-break">
                <CardHeader className="pb-2">
                  <CardTitle>In-zone rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">{Math.round(stats.inZoneRate * 100)}%</div>
                  <div className="text-xs text-gray-500">{stats.inZoneCount} in-zone</div>
                </CardContent>
              </Card>
              <Card className="avoid-break">
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
              <Card className="avoid-break">
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

              <Card className="avoid-break">
                <CardHeader className="pb-2">
                  <CardTitle>Top missed zones</CardTitle>
                </CardHeader>
                <CardContent>
                  {topMissedZones.length ? (
                    <div className="space-y-2 text-sm">
                      {topMissedZones.map((zone) => (
                        <div key={zone.label} className="flex items-center justify-between">
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

            <div className="grid gap-6 md:grid-cols-2">
              <StrikeZoneHeatmap title="Intended Location" counts={intendedCounts} className="avoid-break" />
              <StrikeZoneHeatmap title="Actual Location" counts={actualCounts} className="avoid-break" />
            </div>

            <div className="text-xs text-gray-500">
              Generated on {new Date().toLocaleDateString()}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
