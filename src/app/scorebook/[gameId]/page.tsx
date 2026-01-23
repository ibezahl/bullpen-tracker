"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fetchFullGameData, getErrorMessage } from "@/lib/scorebook/db";
import type { FullGameData } from "@/lib/scorebook/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ScorekeeperInterface } from "@/components/scorebook/ScorekeeperInterface";
import { LineupEditor } from "@/components/scorebook/LineupEditor";
import type { Session } from "@supabase/supabase-js";
import type { TeamSide } from "@/lib/scorebook/types";

export default function GameScoringPage() {
  const router = useRouter();
  const params = useParams();
  const gameId = params.gameId as string;
  const { showToast } = useToast();

  const [session, setSession] = useState<Session | null>(null);
  const [gameData, setGameData] = useState<FullGameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingLineup, setEditingLineup] = useState<TeamSide | null>(null);

  // Auth check
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        router.push("/login");
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        router.push("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  // Load game data
  const loadGameData = useCallback(async () => {
    if (!gameId) return;

    setLoading(true);
    try {
      const data = await fetchFullGameData(gameId);
      if (!data) {
        showToast("Game not found", "error");
        router.push("/scorebook");
        return;
      }
      setGameData(data);
    } catch (e) {
      showToast(getErrorMessage(e), "error");
    } finally {
      setLoading(false);
    }
  }, [gameId, showToast, router]);

  useEffect(() => {
    if (session?.user?.id && gameId) {
      loadGameData();
    }
  }, [session?.user?.id, gameId, loadGameData]);

  if (!session) {
    return null;
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 md:p-6">
        <div className="max-w-6xl mx-auto">
          <Skeleton className="h-8 w-64 mb-6" />
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-96 rounded-lg md:col-span-2" />
            <Skeleton className="h-96 rounded-lg" />
          </div>
        </div>
      </main>
    );
  }

  if (!gameData) {
    return null;
  }

  const { game, homeLineup, awayLineup } = gameData;

  // Check if lineups have pitchers
  const awayHasPitcher = awayLineup.some((p) => p.defensive_position === "P" && p.is_active);
  const homeHasPitcher = homeLineup.some((p) => p.defensive_position === "P" && p.is_active);
  const lineupsComplete = awayHasPitcher && homeHasPitcher;

  const getStatusBadgeVariant = (status: typeof game.status) => {
    switch (status) {
      case "in_progress":
        return "default";
      case "completed":
        return "secondary";
      case "suspended":
        return "outline";
      case "cancelled":
        return "destructive";
      default:
        return "secondary";
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl md:text-2xl font-bold">
                {game.away_team_name} @ {game.home_team_name}
              </h1>
              <Badge variant={getStatusBadgeVariant(game.status)}>
                {game.status === "in_progress"
                  ? `${game.current_half === "top" ? "Top" : "Bot"} ${game.current_inning}`
                  : game.status === "completed"
                    ? "Final"
                    : game.status}
              </Badge>
            </div>
            <p className="text-gray-500 text-sm">
              {new Date(game.game_date).toLocaleDateString()}
              {game.location && ` • ${game.location}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push(`/scorebook/${gameId}/scoresheet`)}>
              Scoresheet
            </Button>
            <Button variant="outline" onClick={() => router.push(`/scorebook/${gameId}/box-score`)}>
              Box Score
            </Button>
            <Button variant="outline" onClick={() => router.push("/scorebook")}>
              Back
            </Button>
          </div>
        </div>

        {/* Lineup Warning */}
        {!lineupsComplete && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <h3 className="font-medium text-amber-800 mb-2">Lineup Setup Required</h3>
            <p className="text-sm text-amber-700 mb-3">
              Both teams need a designated pitcher (position "P") before you can start scoring.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={awayHasPitcher ? "outline" : "default"}
                size="sm"
                onClick={() => setEditingLineup("away")}
              >
                {awayHasPitcher ? `${game.away_team_name} Lineup` : `Set ${game.away_team_name} Pitcher`}
              </Button>
              <Button
                variant={homeHasPitcher ? "outline" : "default"}
                size="sm"
                onClick={() => setEditingLineup("home")}
              >
                {homeHasPitcher ? `${game.home_team_name} Lineup` : `Set ${game.home_team_name} Pitcher`}
              </Button>
            </div>
          </div>
        )}

        {/* Main Scoring Interface */}
        <ScorekeeperInterface
          gameData={gameData}
          userId={session.user.id}
          onGameUpdate={loadGameData}
        />

        {/* Lineup Editor Dialog */}
        <LineupEditor
          gameId={gameId}
          userId={session.user.id}
          teamSide={editingLineup || "away"}
          teamName={editingLineup === "home" ? game.home_team_name : game.away_team_name}
          lineup={editingLineup === "home" ? homeLineup : awayLineup}
          onUpdate={loadGameData}
          open={editingLineup !== null}
          onOpenChange={(open) => !open && setEditingLineup(null)}
        />
      </div>
    </main>
  );
}
