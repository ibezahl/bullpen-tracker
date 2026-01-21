"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

const PITCH_TYPES = ["FB", "SL", "CB", "CH", "CT", "SI"];
const TAGS = ["good feel", "miss up", "miss arm-side", "hung", "sharp", "flat", null];

const PITCHERS = [
  { name: "Jake Miller", throwing_hand: "R" as const },
  { name: "Carlos Rodriguez", throwing_hand: "L" as const },
  { name: "Tyler Johnson", throwing_hand: "R" as const },
  { name: "Marcus Chen", throwing_hand: "R" as const },
  { name: "Brandon Williams", throwing_hand: "L" as const },
];

// Zone IDs for the 5x5 grid
const IN_ZONE_IDS = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3"];
const OUT_ZONE_IDS = ["O1", "O2", "O3", "O4", "O5", "O6", "O7", "O8", "O9", "O10", "O11", "O12", "O13", "O14", "O15", "O16"];
const ALL_ZONE_IDS = [...IN_ZONE_IDS, ...OUT_ZONE_IDS];

// Zone coordinates for the 5x5 grid
const ZONE_COORDS: Record<string, { x: number; y: number }> = {
  O1: { x: 0.1, y: 0.1 }, O2: { x: 0.3, y: 0.1 }, O3: { x: 0.5, y: 0.1 }, O4: { x: 0.7, y: 0.1 }, O5: { x: 0.9, y: 0.1 },
  O6: { x: 0.1, y: 0.3 }, A1: { x: 0.3, y: 0.3 }, A2: { x: 0.5, y: 0.3 }, A3: { x: 0.7, y: 0.3 }, O7: { x: 0.9, y: 0.3 },
  O8: { x: 0.1, y: 0.5 }, B1: { x: 0.3, y: 0.5 }, B2: { x: 0.5, y: 0.5 }, B3: { x: 0.7, y: 0.5 }, O9: { x: 0.9, y: 0.5 },
  O10: { x: 0.1, y: 0.7 }, C1: { x: 0.3, y: 0.7 }, C2: { x: 0.5, y: 0.7 }, C3: { x: 0.7, y: 0.7 }, O11: { x: 0.9, y: 0.7 },
  O12: { x: 0.1, y: 0.9 }, O13: { x: 0.3, y: 0.9 }, O14: { x: 0.5, y: 0.9 }, O15: { x: 0.7, y: 0.9 }, O16: { x: 0.9, y: 0.9 },
};

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate a realistic pitch - most intended locations are in-zone, with some misses
function generatePitch(pitchType: string) {
  // 85% of intended locations are in-zone
  const intendedZone = Math.random() < 0.85 ? randomPick(IN_ZONE_IDS) : randomPick(OUT_ZONE_IDS);

  // Actual location: 60% hit the intended spot, 30% miss to adjacent, 10% miss badly
  let actualZone: string;
  const accuracy = Math.random();
  if (accuracy < 0.6) {
    actualZone = intendedZone; // Hit the target
  } else if (accuracy < 0.9) {
    // Miss to nearby zone
    actualZone = randomPick(ALL_ZONE_IDS);
  } else {
    // Miss badly - likely out of zone
    actualZone = randomPick(OUT_ZONE_IDS);
  }

  const intended = ZONE_COORDS[intendedZone];
  const actual = ZONE_COORDS[actualZone];
  const dx = actual.x - intended.x;
  const dy = actual.y - intended.y;

  return {
    pitch_type: pitchType,
    tag: randomPick(TAGS),
    intended_location_zone_id: intendedZone,
    actual_location_zone_id: actualZone,
    target_x: intended.x,
    target_y: intended.y,
    actual_x: actual.x,
    actual_y: actual.y,
    dx,
    dy,
    notes: Math.random() < 0.2 ? "Working on command today" : null,
  };
}

export default function SeedPage() {
  const [status, setStatus] = useState<string>("");
  const [isSeeding, setIsSeeding] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const log = (msg: string) => {
    setLogs((prev) => [...prev, msg]);
    setStatus(msg);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
    });
  }, []);

  const seedData = async () => {
    if (!userId) {
      log("Please sign in first!");
      return;
    }

    setIsSeeding(true);
    setLogs([]);

    try {
      log("Starting seed...");

      // Create pitchers
      const pitcherIds: string[] = [];
      for (const pitcher of PITCHERS) {
        log(`Creating pitcher: ${pitcher.name}`);
        const { data, error } = await supabase
          .from("pitchers")
          .insert({ user_id: userId, name: pitcher.name, throwing_hand: pitcher.throwing_hand })
          .select("id")
          .single();

        if (error) {
          log(`Error creating pitcher ${pitcher.name}: ${error.message}`);
          continue;
        }
        pitcherIds.push(data.id);
        log(`Created pitcher: ${pitcher.name} (${data.id})`);
      }

      // Create sessions for each pitcher (3-5 sessions per pitcher)
      for (let i = 0; i < pitcherIds.length; i++) {
        const pitcherId = pitcherIds[i];
        const pitcherName = PITCHERS[i].name;
        const numSessions = randomInt(3, 5);

        log(`Creating ${numSessions} sessions for ${pitcherName}...`);

        for (let s = 0; s < numSessions; s++) {
          // Generate session date (within the last 30 days)
          const daysAgo = randomInt(1, 30);
          const sessionDate = new Date();
          sessionDate.setDate(sessionDate.getDate() - daysAgo);
          const dateStr = sessionDate.toISOString().split("T")[0];

          const labels = ["Bullpen #1", "Bullpen #2", "Side work", "Game prep", "Live BP", null];
          const label = randomPick(labels);

          const { data: sessionData, error: sessionError } = await supabase
            .from("sessions")
            .insert({
              user_id: userId,
              pitcher_id: pitcherId,
              session_date: dateStr,
              label,
            })
            .select("id")
            .single();

          if (sessionError) {
            log(`Error creating session: ${sessionError.message}`);
            continue;
          }

          const sessionId = sessionData.id;
          log(`Created session: ${dateStr} ${label || ""} for ${pitcherName}`);

          // Generate pitches for this session (20-40 pitches per session)
          const numPitches = randomInt(20, 40);
          const pitches = [];

          for (let p = 0; p < numPitches; p++) {
            const pitchType = randomPick(PITCH_TYPES);
            const pitch = generatePitch(pitchType);
            pitches.push({
              user_id: userId,
              pitcher_id: pitcherId,
              session_id: sessionId,
              ...pitch,
            });
          }

          // Insert pitches in batches
          const { error: pitchError } = await supabase.from("pitches").insert(pitches);

          if (pitchError) {
            log(`Error creating pitches: ${pitchError.message}`);
          } else {
            log(`Created ${numPitches} pitches for session`);
          }
        }
      }

      log("Seed completed successfully!");
      log(`Created ${pitcherIds.length} pitchers with multiple sessions each.`);
    } catch (e) {
      log(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsSeeding(false);
    }
  };

  const clearData = async () => {
    if (!userId) {
      log("Please sign in first!");
      return;
    }

    const confirmed = window.confirm(
      "This will delete ALL your pitchers, sessions, and pitches. Are you sure?"
    );
    if (!confirmed) return;

    setIsSeeding(true);
    setLogs([]);

    try {
      log("Clearing all data...");

      // Delete in order due to foreign keys
      const { error: pitchesError } = await supabase
        .from("pitches")
        .delete()
        .eq("user_id", userId);
      if (pitchesError) log(`Error deleting pitches: ${pitchesError.message}`);
      else log("Deleted all pitches");

      const { error: sessionsError } = await supabase
        .from("sessions")
        .delete()
        .eq("user_id", userId);
      if (sessionsError) log(`Error deleting sessions: ${sessionsError.message}`);
      else log("Deleted all sessions");

      const { error: pitchersError } = await supabase
        .from("pitchers")
        .delete()
        .eq("user_id", userId);
      if (pitchersError) log(`Error deleting pitchers: ${pitchersError.message}`);
      else log("Deleted all pitchers");

      log("All data cleared!");
    } catch (e) {
      log(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <main className="min-h-screen p-6 flex flex-col gap-6 max-w-2xl mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Seed Test Data</h1>
        <Button asChild variant="outline">
          <Link href="/">Back to Home</Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Test Data Generator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!userId ? (
            <div className="text-amber-600">Please sign in to seed data.</div>
          ) : (
            <div className="text-green-600">Signed in as: {userId.slice(0, 8)}...</div>
          )}

          <div className="text-sm text-gray-600 space-y-1">
            <p>This will create:</p>
            <ul className="list-disc list-inside ml-2">
              <li>5 pitchers (Jake Miller, Carlos Rodriguez, Tyler Johnson, Marcus Chen, Brandon Williams)</li>
              <li>3-5 bullpen sessions per pitcher</li>
              <li>20-40 pitches per session</li>
              <li>Realistic pitch distribution with ~60% accuracy</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <Button onClick={seedData} disabled={isSeeding || !userId}>
              {isSeeding ? "Seeding..." : "Seed Test Data"}
            </Button>
            <Button onClick={clearData} variant="destructive" disabled={isSeeding || !userId}>
              Clear All Data
            </Button>
          </div>
        </CardContent>
      </Card>

      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-sm bg-gray-50 rounded p-3 max-h-80 overflow-y-auto space-y-1">
              {logs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
