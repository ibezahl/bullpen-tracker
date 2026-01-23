"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  fetchTeams,
  createTeam,
  deleteTeam,
  fetchTeamPlayers,
  getErrorMessage,
} from "@/lib/scorebook/db";
import type { SavedTeam, SavedPlayer } from "@/lib/scorebook/types";
import { PLAY_LEVELS } from "@/lib/scorebook/types";
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

export default function TeamsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [session, setSession] = useState<Session | null>(null);
  const [teams, setTeams] = useState<SavedTeam[]>([]);
  const [teamPlayerCounts, setTeamPlayerCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // New team form
  const [showNewTeamForm, setShowNewTeamForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamAbbr, setNewTeamAbbr] = useState("");
  const [newTeamLevel, setNewTeamLevel] = useState<string>("");
  const [creating, setCreating] = useState(false);

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

  // Load teams
  const loadTeams = useCallback(async () => {
    if (!session?.user?.id) return;

    setLoading(true);
    try {
      const data = await fetchTeams(session.user.id);
      setTeams(data);

      // Load player counts for each team
      const counts: Record<string, number> = {};
      await Promise.all(
        data.map(async (team) => {
          try {
            const players = await fetchTeamPlayers(team.id);
            counts[team.id] = players.length;
          } catch {
            counts[team.id] = 0;
          }
        })
      );
      setTeamPlayerCounts(counts);
    } catch (e) {
      showToast(getErrorMessage(e), "error");
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, showToast]);

  useEffect(() => {
    if (session?.user?.id) {
      loadTeams();
    }
  }, [session?.user?.id, loadTeams]);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.id || !newTeamName.trim()) return;

    setCreating(true);
    try {
      const team = await createTeam({
        user_id: session.user.id,
        name: newTeamName.trim(),
        abbreviation: newTeamAbbr.trim() || null,
        level: (newTeamLevel as SavedTeam["level"]) || null,
        notes: null,
      });
      setTeams((prev) => [...prev, team]);
      setTeamPlayerCounts((prev) => ({ ...prev, [team.id]: 0 }));
      setNewTeamName("");
      setNewTeamAbbr("");
      setNewTeamLevel("");
      setShowNewTeamForm(false);
      showToast("Team created", "success");
    } catch (e) {
      showToast(getErrorMessage(e), "error");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTeam = async (teamId: string, teamName: string) => {
    const confirmed = await confirm({
      title: "Delete Team",
      message: `Are you sure you want to delete "${teamName}"? This will also delete all players on the roster.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });

    if (!confirmed) return;

    try {
      await deleteTeam(teamId);
      setTeams((prev) => prev.filter((t) => t.id !== teamId));
      showToast("Team deleted", "success");
    } catch (e) {
      showToast(getErrorMessage(e), "error");
    }
  };

  if (!session) {
    return null;
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Teams</h1>
            <p className="text-gray-600 text-sm mt-1">Manage your saved team rosters</p>
          </div>
          <Button variant="outline" onClick={() => router.push("/scorebook")}>
            Back
          </Button>
        </div>

        {/* New Team Form */}
        {showNewTeamForm ? (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Create New Team</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateTeam} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <Label htmlFor="team-name">Team Name</Label>
                    <Input
                      id="team-name"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      placeholder="e.g., Tigers"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="team-abbr">Abbreviation</Label>
                    <Input
                      id="team-abbr"
                      value={newTeamAbbr}
                      onChange={(e) => setNewTeamAbbr(e.target.value.toUpperCase().slice(0, 4))}
                      placeholder="e.g., TIG"
                      maxLength={4}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="team-level">Level</Label>
                  <Select value={newTeamLevel} onValueChange={setNewTeamLevel}>
                    <SelectTrigger id="team-level">
                      <SelectValue placeholder="Select level (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PLAY_LEVELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={creating || !newTeamName.trim()}>
                    {creating ? "Creating..." : "Create Team"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowNewTeamForm(false);
                      setNewTeamName("");
                      setNewTeamAbbr("");
                      setNewTeamLevel("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Button onClick={() => setShowNewTeamForm(true)} className="mb-6">
            Create New Team
          </Button>
        )}

        {/* Teams List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : teams.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-500 mb-4">No teams yet</p>
              <p className="text-sm text-gray-400">
                Create a team to save rosters for quick lineup setup.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {teams.map((team) => (
              <Card
                key={team.id}
                className="cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => router.push(`/scorebook/teams/${team.id}`)}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold">{team.name}</span>
                        {team.abbreviation && (
                          <span className="text-gray-400">({team.abbreviation})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span>{teamPlayerCounts[team.id] ?? 0} players</span>
                        {team.level && <Badge variant="outline">{PLAY_LEVELS[team.level]}</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTeam(team.id, team.name);
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
      </div>
    </main>
  );
}
