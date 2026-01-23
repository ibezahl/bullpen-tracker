"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  fetchTeam,
  updateTeam,
  fetchTeamPlayers,
  createPlayer,
  updatePlayer,
  deletePlayer,
  getErrorMessage,
} from "@/lib/scorebook/db";
import type { SavedTeam, SavedPlayer, Position, BattingHand, ThrowingHand } from "@/lib/scorebook/types";
import { POSITIONS, POSITION_LIST, PLAY_LEVELS } from "@/lib/scorebook/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { Session } from "@supabase/supabase-js";

export default function TeamRosterPage() {
  const router = useRouter();
  const params = useParams();
  const teamId = params.teamId as string;
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [session, setSession] = useState<Session | null>(null);
  const [team, setTeam] = useState<SavedTeam | null>(null);
  const [players, setPlayers] = useState<SavedPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  // Editing team name
  const [editingTeamName, setEditingTeamName] = useState(false);
  const [teamNameDraft, setTeamNameDraft] = useState("");

  // New player form
  const [showNewPlayerForm, setShowNewPlayerForm] = useState(false);
  const [newPlayerFirst, setNewPlayerFirst] = useState("");
  const [newPlayerLast, setNewPlayerLast] = useState("");
  const [newPlayerNumber, setNewPlayerNumber] = useState("");
  const [newPlayerBats, setNewPlayerBats] = useState<string>("");
  const [newPlayerThrows, setNewPlayerThrows] = useState<string>("");
  const [newPlayerPosition, setNewPlayerPosition] = useState<string>("");
  const [creating, setCreating] = useState(false);

  // Editing player
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);

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

  // Load team and players
  const loadData = useCallback(async () => {
    if (!teamId) return;

    setLoading(true);
    try {
      const [teamData, playersData] = await Promise.all([
        fetchTeam(teamId),
        fetchTeamPlayers(teamId),
      ]);

      if (!teamData) {
        showToast("Team not found", "error");
        router.push("/scorebook/teams");
        return;
      }

      setTeam(teamData);
      setPlayers(playersData);
    } catch (e) {
      showToast(getErrorMessage(e), "error");
    } finally {
      setLoading(false);
    }
  }, [teamId, showToast, router]);

  useEffect(() => {
    if (session?.user?.id && teamId) {
      loadData();
    }
  }, [session?.user?.id, teamId, loadData]);

  const handleUpdateTeamName = async () => {
    if (!team || !teamNameDraft.trim()) return;

    try {
      const updated = await updateTeam(team.id, { name: teamNameDraft.trim() });
      setTeam(updated);
      setEditingTeamName(false);
      showToast("Team name updated", "success");
    } catch (e) {
      showToast(getErrorMessage(e), "error");
    }
  };

  const handleCreatePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.id || !team || !newPlayerFirst.trim() || !newPlayerLast.trim()) return;

    setCreating(true);
    try {
      const player = await createPlayer({
        user_id: session.user.id,
        team_id: team.id,
        first_name: newPlayerFirst.trim(),
        last_name: newPlayerLast.trim(),
        jersey_number: newPlayerNumber.trim() || null,
        bats: (newPlayerBats as BattingHand) || null,
        throws: (newPlayerThrows as ThrowingHand) || null,
        primary_position: (newPlayerPosition as Position) || null,
        secondary_positions: null,
      });
      setPlayers((prev) => [...prev, player].sort((a, b) => a.last_name.localeCompare(b.last_name)));
      resetNewPlayerForm();
      showToast("Player added", "success");
    } catch (e) {
      showToast(getErrorMessage(e), "error");
    } finally {
      setCreating(false);
    }
  };

  const resetNewPlayerForm = () => {
    setShowNewPlayerForm(false);
    setNewPlayerFirst("");
    setNewPlayerLast("");
    setNewPlayerNumber("");
    setNewPlayerBats("");
    setNewPlayerThrows("");
    setNewPlayerPosition("");
  };

  const handleDeletePlayer = async (playerId: string, playerName: string) => {
    const confirmed = await confirm({
      title: "Delete Player",
      message: `Are you sure you want to remove ${playerName} from the roster?`,
      confirmLabel: "Remove",
      variant: "destructive",
    });

    if (!confirmed) return;

    try {
      await deletePlayer(playerId);
      setPlayers((prev) => prev.filter((p) => p.id !== playerId));
      showToast("Player removed", "success");
    } catch (e) {
      showToast(getErrorMessage(e), "error");
    }
  };

  if (!session) {
    return null;
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 md:p-6">
        <div className="max-w-3xl mx-auto">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </main>
    );
  }

  if (!team) {
    return null;
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            {editingTeamName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={teamNameDraft}
                  onChange={(e) => setTeamNameDraft(e.target.value)}
                  className="text-2xl font-bold h-10"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleUpdateTeamName();
                    if (e.key === "Escape") setEditingTeamName(false);
                  }}
                />
                <Button size="sm" onClick={handleUpdateTeamName}>
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingTeamName(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <h1
                className="text-2xl md:text-3xl font-bold cursor-pointer hover:text-gray-700"
                onClick={() => {
                  setTeamNameDraft(team.name);
                  setEditingTeamName(true);
                }}
                title="Click to edit"
              >
                {team.name}
              </h1>
            )}
            <p className="text-gray-600 text-sm mt-1">
              {players.length} player{players.length !== 1 ? "s" : ""} on roster
              {team.level && ` • ${PLAY_LEVELS[team.level]}`}
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push("/scorebook/teams")}>
            Back
          </Button>
        </div>

        {/* New Player Form */}
        {showNewPlayerForm ? (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Add Player</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreatePlayer} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label htmlFor="first-name">First Name</Label>
                    <Input
                      id="first-name"
                      value={newPlayerFirst}
                      onChange={(e) => setNewPlayerFirst(e.target.value)}
                      placeholder="John"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="last-name">Last Name</Label>
                    <Input
                      id="last-name"
                      value={newPlayerLast}
                      onChange={(e) => setNewPlayerLast(e.target.value)}
                      placeholder="Smith"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="jersey-number">Number</Label>
                    <Input
                      id="jersey-number"
                      value={newPlayerNumber}
                      onChange={(e) => setNewPlayerNumber(e.target.value)}
                      placeholder="23"
                      maxLength={3}
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label htmlFor="bats">Bats</Label>
                    <Select value={newPlayerBats} onValueChange={setNewPlayerBats}>
                      <SelectTrigger id="bats">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="R">Right</SelectItem>
                        <SelectItem value="L">Left</SelectItem>
                        <SelectItem value="S">Switch</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="throws">Throws</Label>
                    <Select value={newPlayerThrows} onValueChange={setNewPlayerThrows}>
                      <SelectTrigger id="throws">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="R">Right</SelectItem>
                        <SelectItem value="L">Left</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="position">Position</Label>
                    <Select value={newPlayerPosition} onValueChange={setNewPlayerPosition}>
                      <SelectTrigger id="position">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {POSITION_LIST.map((pos) => (
                          <SelectItem key={pos} value={pos}>
                            {pos} - {POSITIONS[pos]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    disabled={creating || !newPlayerFirst.trim() || !newPlayerLast.trim()}
                  >
                    {creating ? "Adding..." : "Add Player"}
                  </Button>
                  <Button type="button" variant="outline" onClick={resetNewPlayerForm}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Button onClick={() => setShowNewPlayerForm(true)} className="mb-6">
            Add Player
          </Button>
        )}

        {/* Players List */}
        {players.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-500 mb-4">No players on roster</p>
              <p className="text-sm text-gray-400">
                Add players to use this team in games.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Roster</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {players.map((player) => (
                  <div key={player.id} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {player.jersey_number && (
                        <span className="font-mono text-lg font-semibold w-8 text-center">
                          {player.jersey_number}
                        </span>
                      )}
                      <div>
                        <p className="font-medium">
                          {player.first_name} {player.last_name}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          {player.primary_position && (
                            <Badge variant="outline">{player.primary_position}</Badge>
                          )}
                          {player.bats && <span>B: {player.bats}</span>}
                          {player.throws && <span>T: {player.throws}</span>}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        handleDeletePlayer(
                          player.id,
                          `${player.first_name} ${player.last_name}`
                        )
                      }
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
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
