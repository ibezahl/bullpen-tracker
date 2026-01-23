"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fetchFullGameData, getErrorMessage } from "@/lib/scorebook/db";
import type { FullGameData } from "@/lib/scorebook/db";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { BoxScoreView } from "@/components/scorebook/BoxScoreView";
import type { Session } from "@supabase/supabase-js";

export default function BoxScorePage() {
  const router = useRouter();
  const params = useParams();
  const gameId = params.gameId as string;
  const { showToast } = useToast();

  const [session, setSession] = useState<Session | null>(null);
  const [gameData, setGameData] = useState<FullGameData | null>(null);
  const [loading, setLoading] = useState(true);

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
        <div className="max-w-4xl mx-auto">
          <Skeleton className="h-8 w-64 mb-6" />
          <Skeleton className="h-32 rounded-lg mb-4" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-64 rounded-lg" />
            <Skeleton className="h-64 rounded-lg" />
          </div>
        </div>
      </main>
    );
  }

  if (!gameData) {
    return null;
  }

  const { game } = gameData;

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Box Score</h1>
            <p className="text-gray-500">
              {game.away_team_name} @ {game.home_team_name} •{" "}
              {new Date(game.game_date).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push(`/scorebook/${gameId}/print`)}>
              Print
            </Button>
            <Button variant="outline" onClick={() => router.push(`/scorebook/${gameId}`)}>
              Back to Game
            </Button>
          </div>
        </div>

        {/* Box Score Content */}
        <BoxScoreView gameData={gameData} />
      </div>
    </main>
  );
}
