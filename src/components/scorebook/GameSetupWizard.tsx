"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  fetchTeams,
  fetchTeamPlayers,
  createGame,
  createLineupEntries,
  getErrorMessage,
} from "@/lib/scorebook/db";
import type {
  SavedTeam,
  SavedPlayer,
  GameInsert,
  GameLineupEntryInsert,
  Position,
  TeamSide,
  HalfInning,
} from "@/lib/scorebook/types";
import { POSITIONS, POSITION_LIST } from "@/lib/scorebook/types";
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
import { useToast } from "@/components/ui/toast";
import type { Session } from "@supabase/supabase-js";

type WizardStep = "teams" | "settings" | "away_lineup" | "home_lineup" | "review";

type LineupPlayer = {
  id: string;
  playerName: string;
  jerseyNumber: string;
  battingOrder: number | null;
  position: Position | null;
  sourcePlayerId: string | null;
};

type Props = {
  session: Session;
};

export function GameSetupWizard({ session }: Props) {
  const router = useRouter();
  const { showToast } = useToast();

  const [step, setStep] = useState<WizardStep>("teams");
  const [creating, setCreating] = useState(false);

  // Teams data
  const [savedTeams, setSavedTeams] = useState<SavedTeam[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);

  // Team selections
  const [awayTeamId, setAwayTeamId] = useState<string>("");
  const [homeTeamId, setHomeTeamId] = useState<string>("");
  const [awayTeamName, setAwayTeamName] = useState("");
  const [homeTeamName, setHomeTeamName] = useState("");

  // Game settings
  const [gameDate, setGameDate] = useState(new Date().toISOString().split("T")[0]);
  const [gameTime, setGameTime] = useState("");
  const [location, setLocation] = useState("");
  const [inningsScheduled, setInningsScheduled] = useState("9");
  const [useDH, setUseDH] = useState(false);

  // Lineups
  const [awayLineup, setAwayLineup] = useState<LineupPlayer[]>([]);
  const [homeLineup, setHomeLineup] = useState<LineupPlayer[]>([]);

  // Load saved teams
  useEffect(() => {
    const loadTeams = async () => {
      try {
        const teams = await fetchTeams(session.user.id);
        setSavedTeams(teams);
      } catch (e) {
        showToast(getErrorMessage(e), "error");
      } finally {
        setLoadingTeams(false);
      }
    };
    loadTeams();
  }, [session.user.id, showToast]);

  // Load team players when a saved team is selected
  const loadTeamPlayers = useCallback(
    async (teamId: string, side: TeamSide) => {
      if (!teamId || teamId === "custom") return;

      try {
        const players = await fetchTeamPlayers(teamId);
        const lineupPlayers: LineupPlayer[] = players.map((p, idx) => ({
          id: `${side}-${idx}`,
          playerName: `${p.first_name} ${p.last_name}`,
          jerseyNumber: p.jersey_number || "",
          battingOrder: null,
          position: p.primary_position || null,
          sourcePlayerId: p.id,
        }));

        if (side === "away") {
          setAwayLineup(lineupPlayers);
        } else {
          setHomeLineup(lineupPlayers);
        }
      } catch (e) {
        showToast(getErrorMessage(e), "error");
      }
    },
    [showToast]
  );

  // Handle team selection
  const handleAwayTeamChange = (value: string) => {
    setAwayTeamId(value);
    if (value === "custom") {
      setAwayTeamName("");
      setAwayLineup([]);
    } else {
      const team = savedTeams.find((t) => t.id === value);
      setAwayTeamName(team?.name || "");
      loadTeamPlayers(value, "away");
    }
  };

  const handleHomeTeamChange = (value: string) => {
    setHomeTeamId(value);
    if (value === "custom") {
      setHomeTeamName("");
      setHomeLineup([]);
    } else {
      const team = savedTeams.find((t) => t.id === value);
      setHomeTeamName(team?.name || "");
      loadTeamPlayers(value, "home");
    }
  };

  // Add a player to lineup
  const addPlayerToLineup = (side: TeamSide) => {
    const lineup = side === "away" ? awayLineup : homeLineup;
    const setLineup = side === "away" ? setAwayLineup : setHomeLineup;

    const newPlayer: LineupPlayer = {
      id: `${side}-${Date.now()}`,
      playerName: "",
      jerseyNumber: "",
      battingOrder: null,
      position: null,
      sourcePlayerId: null,
    };

    setLineup([...lineup, newPlayer]);
  };

  // Update a player in lineup
  const updateLineupPlayer = (
    side: TeamSide,
    playerId: string,
    updates: Partial<LineupPlayer>
  ) => {
    const setLineup = side === "away" ? setAwayLineup : setHomeLineup;
    setLineup((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, ...updates } : p))
    );
  };

  // Remove a player from lineup
  const removePlayerFromLineup = (side: TeamSide, playerId: string) => {
    const setLineup = side === "away" ? setAwayLineup : setHomeLineup;
    setLineup((prev) => prev.filter((p) => p.id !== playerId));
  };

  // Set batting order
  const setBattingOrder = (side: TeamSide, playerId: string, order: number | null) => {
    const setLineup = side === "away" ? setAwayLineup : setHomeLineup;
    setLineup((prev) =>
      prev.map((p) => {
        if (p.id === playerId) {
          return { ...p, battingOrder: order };
        }
        // Clear this order from other players
        if (order !== null && p.battingOrder === order) {
          return { ...p, battingOrder: null };
        }
        return p;
      })
    );
  };

  // Validation
  const canProceedFromTeams = awayTeamName.trim() && homeTeamName.trim();
  const canProceedFromSettings = gameDate;

  const getStartingLineup = (lineup: LineupPlayer[]) =>
    lineup.filter((p) => p.battingOrder !== null && p.battingOrder >= 1 && p.battingOrder <= 9);

  const hasPitcher = (lineup: LineupPlayer[]) =>
    lineup.some((p) => p.position === "P" && p.playerName.trim());

  const canProceedFromAwayLineup = getStartingLineup(awayLineup).length >= 9 && hasPitcher(awayLineup);
  const canProceedFromHomeLineup = getStartingLineup(homeLineup).length >= 9 && hasPitcher(homeLineup);

  // Create the game
  const handleCreateGame = async () => {
    if (!session?.user?.id) return;

    setCreating(true);
    try {
      // Create the game
      const gameData: GameInsert = {
        user_id: session.user.id,
        game_date: gameDate,
        game_time: gameTime || null,
        location: location || null,
        weather: null,
        notes: null,
        home_team_id: homeTeamId && homeTeamId !== "custom" ? homeTeamId : null,
        away_team_id: awayTeamId && awayTeamId !== "custom" ? awayTeamId : null,
        home_team_name: homeTeamName,
        away_team_name: awayTeamName,
        status: "in_progress",
        current_inning: 1,
        current_half: "top" as HalfInning,
        home_final_score: 0,
        away_final_score: 0,
        innings_scheduled: parseInt(inningsScheduled, 10) || 9,
        use_dh: useDH,
      };

      const game = await createGame(gameData);

      // Create lineup entries
      const lineupEntries: GameLineupEntryInsert[] = [];

      // Away lineup
      for (const player of awayLineup) {
        lineupEntries.push({
          user_id: session.user.id,
          game_id: game.id,
          team_side: "away" as TeamSide,
          player_id: player.sourcePlayerId,
          player_name: player.playerName,
          jersey_number: player.jerseyNumber || null,
          bats: null,
          throws: null,
          batting_order: player.battingOrder,
          defensive_position: player.position,
          entry_inning: 1,
          entry_half: "top" as HalfInning,
          entry_batter: 1,
          is_active: true,
        });
      }

      // Home lineup
      for (const player of homeLineup) {
        lineupEntries.push({
          user_id: session.user.id,
          game_id: game.id,
          team_side: "home" as TeamSide,
          player_id: player.sourcePlayerId,
          player_name: player.playerName,
          jersey_number: player.jerseyNumber || null,
          bats: null,
          throws: null,
          batting_order: player.battingOrder,
          defensive_position: player.position,
          entry_inning: 1,
          entry_half: "top" as HalfInning,
          entry_batter: 1,
          is_active: true,
        });
      }

      await createLineupEntries(lineupEntries);

      showToast("Game created! Let's play ball!", "success");
      router.push(`/scorebook/${game.id}`);
    } catch (e) {
      showToast(getErrorMessage(e), "error");
    } finally {
      setCreating(false);
    }
  };

  // Render step content
  const renderStepContent = () => {
    switch (step) {
      case "teams":
        return (
          <div className="space-y-6">
            <div>
              <Label className="text-base font-semibold mb-3 block">Away Team</Label>
              <div className="space-y-2">
                <Select value={awayTeamId} onValueChange={handleAwayTeamChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a team or enter custom" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Enter Custom Team Name</SelectItem>
                    {savedTeams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(awayTeamId === "custom" || !awayTeamId) && (
                  <Input
                    value={awayTeamName}
                    onChange={(e) => setAwayTeamName(e.target.value)}
                    placeholder="Team name"
                  />
                )}
              </div>
            </div>

            <div>
              <Label className="text-base font-semibold mb-3 block">Home Team</Label>
              <div className="space-y-2">
                <Select value={homeTeamId} onValueChange={handleHomeTeamChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a team or enter custom" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Enter Custom Team Name</SelectItem>
                    {savedTeams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(homeTeamId === "custom" || !homeTeamId) && (
                  <Input
                    value={homeTeamName}
                    onChange={(e) => setHomeTeamName(e.target.value)}
                    placeholder="Team name"
                  />
                )}
              </div>
            </div>
          </div>
        );

      case "settings":
        return (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="game-date">Date</Label>
                <Input
                  id="game-date"
                  type="date"
                  value={gameDate}
                  onChange={(e) => setGameDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="game-time">Time (optional)</Label>
                <Input
                  id="game-time"
                  type="time"
                  value={gameTime}
                  onChange={(e) => setGameTime(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="location">Location (optional)</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Field name or address"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="innings">Innings Scheduled</Label>
                <Select value={inningsScheduled} onValueChange={setInningsScheduled}>
                  <SelectTrigger id="innings">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 innings</SelectItem>
                    <SelectItem value="6">6 innings</SelectItem>
                    <SelectItem value="7">7 innings</SelectItem>
                    <SelectItem value="9">9 innings</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="use-dh"
                  checked={useDH}
                  onChange={(e) => setUseDH(e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="use-dh" className="cursor-pointer">
                  Use Designated Hitter
                </Label>
              </div>
            </div>
          </div>
        );

      case "away_lineup":
      case "home_lineup":
        const isAway = step === "away_lineup";
        const lineup = isAway ? awayLineup : homeLineup;
        const teamName = isAway ? awayTeamName : homeTeamName;
        const side: TeamSide = isAway ? "away" : "home";

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{teamName} Lineup</h3>
              <Button variant="outline" size="sm" onClick={() => addPlayerToLineup(side)}>
                Add Player
              </Button>
            </div>

            <p className="text-sm text-gray-500">
              Set batting order (1-9) for starting players. Players without a batting order will
              be on the bench. <strong>You must designate one player as pitcher (P).</strong>
            </p>

            {!hasPitcher(lineup) && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                No pitcher assigned. Set one player's position to "P" to continue.
              </div>
            )}

            <div className="space-y-2">
              {lineup.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center gap-2 p-2 border rounded bg-white"
                >
                  <Select
                    value={player.battingOrder?.toString() || "bench"}
                    onValueChange={(v) =>
                      setBattingOrder(side, player.id, v === "bench" ? null : parseInt(v, 10))
                    }
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bench">-</SelectItem>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                        <SelectItem key={n} value={n.toString()}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    value={player.jerseyNumber}
                    onChange={(e) =>
                      updateLineupPlayer(side, player.id, { jerseyNumber: e.target.value })
                    }
                    placeholder="#"
                    className="w-16"
                  />

                  <Input
                    value={player.playerName}
                    onChange={(e) =>
                      updateLineupPlayer(side, player.id, { playerName: e.target.value })
                    }
                    placeholder="Player name"
                    className="flex-1"
                  />

                  <Select
                    value={player.position || "none"}
                    onValueChange={(v) =>
                      updateLineupPlayer(side, player.id, {
                        position: v === "none" ? null : (v as Position),
                      })
                    }
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue placeholder="Pos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-</SelectItem>
                      {POSITION_LIST.map((pos) => (
                        <SelectItem key={pos} value={pos}>
                          {pos}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removePlayerFromLineup(side, player.id)}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className={getStartingLineup(lineup).length >= 9 ? "text-green-600" : ""}>
                Starting lineup: {getStartingLineup(lineup).length}/9 players
              </span>
              <span className={hasPitcher(lineup) ? "text-green-600" : "text-amber-600"}>
                Pitcher: {hasPitcher(lineup) ? "Set" : "Not set"}
              </span>
            </div>
          </div>
        );

      case "review":
        return (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="font-semibold mb-2">Game Info</h3>
                <p>
                  <span className="text-gray-500">Date:</span> {gameDate}
                </p>
                {gameTime && (
                  <p>
                    <span className="text-gray-500">Time:</span> {gameTime}
                  </p>
                )}
                {location && (
                  <p>
                    <span className="text-gray-500">Location:</span> {location}
                  </p>
                )}
                <p>
                  <span className="text-gray-500">Innings:</span> {inningsScheduled}
                </p>
                <p>
                  <span className="text-gray-500">DH:</span> {useDH ? "Yes" : "No"}
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Matchup</h3>
                <p className="text-lg">
                  {awayTeamName} @ {homeTeamName}
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="font-semibold mb-2">{awayTeamName} Starting Lineup</h3>
                <div className="space-y-1">
                  {getStartingLineup(awayLineup)
                    .sort((a, b) => (a.battingOrder || 0) - (b.battingOrder || 0))
                    .map((p) => (
                      <div key={p.id} className="flex items-center gap-2 text-sm">
                        <span className="w-4">{p.battingOrder}.</span>
                        <span className="flex-1">{p.playerName}</span>
                        {p.position && <Badge variant="outline">{p.position}</Badge>}
                      </div>
                    ))}
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">{homeTeamName} Starting Lineup</h3>
                <div className="space-y-1">
                  {getStartingLineup(homeLineup)
                    .sort((a, b) => (a.battingOrder || 0) - (b.battingOrder || 0))
                    .map((p) => (
                      <div key={p.id} className="flex items-center gap-2 text-sm">
                        <span className="w-4">{p.battingOrder}.</span>
                        <span className="flex-1">{p.playerName}</span>
                        {p.position && <Badge variant="outline">{p.position}</Badge>}
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  // Navigation
  const steps: WizardStep[] = ["teams", "settings", "away_lineup", "home_lineup", "review"];
  const currentStepIndex = steps.indexOf(step);

  const canGoNext = () => {
    switch (step) {
      case "teams":
        return canProceedFromTeams;
      case "settings":
        return canProceedFromSettings;
      case "away_lineup":
        return canProceedFromAwayLineup;
      case "home_lineup":
        return canProceedFromHomeLineup;
      case "review":
        return true;
      default:
        return false;
    }
  };

  const goNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setStep(steps[nextIndex]);
    }
  };

  const goPrev = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setStep(steps[prevIndex]);
    }
  };

  const stepLabels: Record<WizardStep, string> = {
    teams: "Teams",
    settings: "Settings",
    away_lineup: "Away Lineup",
    home_lineup: "Home Lineup",
    review: "Review",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Game Setup</CardTitle>
        <div className="flex items-center gap-2 mt-2">
          {steps.map((s, idx) => (
            <div key={s} className="flex items-center">
              <div
                className={`px-2 py-1 rounded text-xs ${
                  idx === currentStepIndex
                    ? "bg-primary text-primary-foreground"
                    : idx < currentStepIndex
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-500"
                }`}
              >
                {stepLabels[s]}
              </div>
              {idx < steps.length - 1 && <span className="mx-1 text-gray-300">→</span>}
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {loadingTeams ? (
          <div className="py-8 text-center text-gray-500">Loading teams...</div>
        ) : (
          <>
            {renderStepContent()}

            <div className="flex justify-between mt-6 pt-4 border-t">
              <Button
                variant="outline"
                onClick={goPrev}
                disabled={currentStepIndex === 0}
              >
                Back
              </Button>

              {step === "review" ? (
                <Button onClick={handleCreateGame} disabled={creating}>
                  {creating ? "Creating..." : "Start Game"}
                </Button>
              ) : (
                <Button onClick={goNext} disabled={!canGoNext()}>
                  Next
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
