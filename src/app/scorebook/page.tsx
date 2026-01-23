"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fetchGames, deleteGame, getErrorMessage } from "@/lib/scorebook/db";
import type { Game } from "@/lib/scorebook/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { Session } from "@supabase/supabase-js";

export default function ScorebookDashboard() {
  const router = useRouter();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [session, setSession] = useState<Session | null>(null);
  const [games, setGames] = useState<Game[]>([]);
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

  // Load games
  const loadGames = useCallback(async () => {
    if (!session?.user?.id) return;

    setLoading(true);
    try {
      const data = await fetchGames(session.user.id);
      setGames(data);
    } catch (e) {
      showToast(getErrorMessage(e), "error");
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, showToast]);

  useEffect(() => {
    if (session?.user?.id) {
      loadGames();
    }
  }, [session?.user?.id, loadGames]);

  const handleDeleteGame = async (gameId: string, gameName: string) => {
    const confirmed = await confirm({
      title: "Delete Game",
      message: `Are you sure you want to delete "${gameName}"? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });

    if (!confirmed) return;

    try {
      await deleteGame(gameId);
      setGames((prev) => prev.filter((g) => g.id !== gameId));
      showToast("Game deleted", "success");
    } catch (e) {
      showToast(getErrorMessage(e), "error");
    }
  };

  const getStatusBadgeVariant = (status: Game["status"]) => {
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

  const getStatusLabel = (status: Game["status"]) => {
    switch (status) {
      case "in_progress":
        return "In Progress";
      case "completed":
        return "Final";
      case "suspended":
        return "Suspended";
      case "cancelled":
        return "Cancelled";
      default:
        return status;
    }
  };

  if (!session) {
    return null;
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Scorebook</h1>
            <p className="text-gray-600 text-sm mt-1">Score and track baseball games</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => router.push("/home")}>
              Home
            </Button>
            <Button variant="outline" onClick={() => router.push("/scorebook/teams")}>
              Teams
            </Button>
            <Button onClick={() => router.push("/scorebook/new")}>New Game</Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : games.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-500 mb-4">No games yet</p>
              <Button onClick={() => router.push("/scorebook/new")}>Start Your First Game</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {games.map((game) => (
              <Card
                key={game.id}
                className="cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => router.push(`/scorebook/${game.id}`)}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold">{game.away_team_name}</span>
                        <span className="text-gray-400">@</span>
                        <span className="font-semibold">{game.home_team_name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-500">
                        <span>{new Date(game.game_date).toLocaleDateString()}</span>
                        {game.location && <span>{game.location}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-2xl font-bold tabular-nums">
                          {game.away_final_score} - {game.home_final_score}
                        </div>
                        <Badge variant={getStatusBadgeVariant(game.status)}>
                          {getStatusLabel(game.status)}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteGame(
                            game.id,
                            `${game.away_team_name} @ ${game.home_team_name}`
                          );
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-6 text-center">
          <Button variant="link" onClick={() => router.push("/")}>
            Back to Pitch Tracker
          </Button>
        </div>
      </div>
    </main>
  );
}
