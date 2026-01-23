"use client";

import { useState, useCallback, useMemo } from "react";
import type { FullGameData } from "@/lib/scorebook/db";
import {
  createAtBat,
  createPlay,
  updateGame,
  deleteAtBat,
  getErrorMessage,
} from "@/lib/scorebook/db";
import type {
  AtBatInsert,
  PlayInsert,
  GameLineupEntry,
  HalfInning,
  TeamSide,
  AtBatResultType,
} from "@/lib/scorebook/types";
import {
  getBattingTeam,
  getFieldingTeam,
  AT_BAT_RESULTS,
} from "@/lib/scorebook/types";
import {
  getCurrentGameState,
  getStartingLineup,
  getCurrentPitcher,
  shouldAdvanceHalfInning,
  getNextHalfInning,
  getOutsFromResult,
  getBatterBaseAdvancement,
  calculateCorrectInningState,
  calculateScores,
} from "@/lib/scorebook/gameState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { BaseRunnersDisplay, OutCounter, GameSituationDisplay } from "./BaseRunnersDisplay";
import { AtBatEntryForm, type AtBatEntryData } from "./AtBatEntryForm";

type Props = {
  gameData: FullGameData;
  userId: string;
  onGameUpdate: () => void;
};

export function ScorekeeperInterface({ gameData, userId, onGameUpdate }: Props) {
  const { showToast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true);

  const { game, homeLineup, awayLineup, atBats, plays } = gameData;

  // Calculate current game state
  const currentState = useMemo(
    () => getCurrentGameState(game, homeLineup, awayLineup, atBats, plays),
    [game, homeLineup, awayLineup, atBats, plays]
  );

  // Get lineups
  const battingLineup = currentState.battingTeam === "home" ? homeLineup : awayLineup;
  const fieldingLineup = currentState.battingTeam === "home" ? awayLineup : homeLineup;
  const battingTeamName =
    currentState.battingTeam === "home" ? game.home_team_name : game.away_team_name;
  const fieldingTeamName =
    currentState.battingTeam === "home" ? game.away_team_name : game.home_team_name;

  // Get current batter and pitcher
  const startingLineup = getStartingLineup(battingLineup);
  const currentBatter = startingLineup[currentState.currentBatterIndex] ?? null;
  const currentPitcher = getCurrentPitcher(fieldingLineup);

  // Count at-bats in current half-inning
  const currentInningAtBats = atBats.filter(
    (ab) => ab.inning === currentState.inning && ab.half === currentState.half
  );
  const batterNumberInInning = currentInningAtBats.length + 1;

  // Handle recording an at-bat
  const handleRecordAtBat = useCallback(
    async (data: AtBatEntryData) => {
      if (!currentBatter || !currentPitcher) {
        showToast("Missing batter or pitcher", "error");
        return;
      }

      setIsSaving(true);
      try {
        // Create the at-bat record
        const atBatData: AtBatInsert = {
          user_id: userId,
          game_id: game.id,
          inning: currentState.inning,
          half: currentState.half,
          batter_number: batterNumberInInning,
          batter_lineup_id: currentBatter.id,
          pitcher_lineup_id: currentPitcher.id,
          result_type: data.resultType,
          result_detail: data.resultDetail,
          balls: data.balls,
          strikes: data.strikes,
          pitch_count: data.pitchCount,
          pitch_sequence: null,
          hit_location_x: null,
          hit_location_y: null,
          hit_zone_id: null,
          final_pitch_zone_id: null,
          rbis: data.rbis,
          is_quality_ab: false,
          notes: data.notes,
        };

        const newAtBat = await createAtBat(atBatData);

        // Create plays based on the result
        const resultInfo = AT_BAT_RESULTS[data.resultType];
        const outsFromResult = getOutsFromResult(data.resultType);
        const batterDestination = getBatterBaseAdvancement(data.resultType);

        // Create the batter's play
        const batterPlay: PlayInsert = {
          user_id: userId,
          game_id: game.id,
          at_bat_id: newAtBat.id,
          play_sequence: 1,
          runner_lineup_id: currentBatter.id,
          play_type: resultInfo.isOut ? "out" : "advance",
          from_base: "0",
          to_base: batterDestination,
          fielding_sequence: data.resultDetail,
          putout_positions: null,
          assist_positions: null,
          error_position: data.resultType === "E" ? null : null, // Would need to parse from resultDetail
          error_type: null,
          is_out: resultInfo.isOut,
          run_scored: batterDestination === "H",
          is_earned_run: batterDestination === "H" && data.resultType !== "E",
          notes: null,
        };

        await createPlay(batterPlay);

        // Calculate new outs
        const newOuts = currentState.outs + outsFromResult;

        // Check if we need to advance the half-inning
        if (shouldAdvanceHalfInning(newOuts)) {
          const { inning: newInning, half: newHalf } = getNextHalfInning(
            currentState.inning,
            currentState.half
          );

          // Update game state
          await updateGame(game.id, {
            current_inning: newInning,
            current_half: newHalf,
            home_final_score: currentState.homeScore + (currentState.battingTeam === "home" && batterDestination === "H" ? 1 : 0),
            away_final_score: currentState.awayScore + (currentState.battingTeam === "away" && batterDestination === "H" ? 1 : 0),
          });
        } else {
          // Just update scores if a run scored
          if (batterDestination === "H") {
            await updateGame(game.id, {
              home_final_score: currentState.homeScore + (currentState.battingTeam === "home" ? 1 : 0),
              away_final_score: currentState.awayScore + (currentState.battingTeam === "away" ? 1 : 0),
            });
          }
        }

        setIsRecording(false);
        showToast("At-bat recorded", "success");
        onGameUpdate();
      } catch (e) {
        showToast(getErrorMessage(e), "error");
      } finally {
        setIsSaving(false);
      }
    },
    [
      userId,
      game.id,
      currentBatter,
      currentPitcher,
      currentState,
      batterNumberInInning,
      showToast,
      onGameUpdate,
    ]
  );

  // Handle deleting an at-bat (undo)
  const handleDeleteAtBat = useCallback(
    async (atBatId: string) => {
      setIsDeleting(atBatId);
      try {
        // Delete the at-bat (plays are deleted via cascade)
        await deleteAtBat(atBatId);

        // Recalculate the correct inning state after deletion
        const remainingAtBats = atBats.filter((ab) => ab.id !== atBatId);
        const remainingPlays = plays.filter((p) => p.at_bat_id !== atBatId);

        const { inning: correctInning, half: correctHalf } = calculateCorrectInningState(
          remainingAtBats,
          remainingPlays
        );

        // Recalculate scores
        const { homeScore, awayScore } = calculateScores(remainingAtBats, remainingPlays);

        // Update game state to the correct inning/half and scores
        await updateGame(game.id, {
          current_inning: correctInning,
          current_half: correctHalf,
          home_final_score: homeScore,
          away_final_score: awayScore,
        });

        showToast("At-bat removed", "success");
        onGameUpdate();
      } catch (e) {
        showToast(getErrorMessage(e), "error");
      } finally {
        setIsDeleting(null);
      }
    },
    [game.id, atBats, plays, showToast, onGameUpdate]
  );

  // Get at-bats for current inning (most recent first for history display)
  const recentAtBats = useMemo(() => {
    return [...atBats]
      .sort((a, b) => {
        // Sort by inning desc, then by half (bottom before top), then by batter_number desc
        if (a.inning !== b.inning) return b.inning - a.inning;
        if (a.half !== b.half) return a.half === "bottom" ? -1 : 1;
        return b.batter_number - a.batter_number;
      })
      .slice(0, 10); // Show last 10 at-bats
  }, [atBats]);

  // Check if game is complete
  const isGameComplete = game.status === "completed";

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Left: Game situation and lineup */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {game.away_team_name} @ {game.home_team_name}
            </CardTitle>
            <Badge variant={isGameComplete ? "secondary" : "default"}>
              {isGameComplete
                ? "Final"
                : `${currentState.half === "top" ? "Top" : "Bot"} ${currentState.inning}`}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {/* Score display */}
          <div className="flex items-center justify-center gap-8 py-4 border-b mb-4">
            <div className="text-center">
              <p className="text-sm text-gray-500">{game.away_team_name}</p>
              <p className="text-3xl font-bold tabular-nums">{currentState.awayScore}</p>
            </div>
            <div className="text-gray-300">-</div>
            <div className="text-center">
              <p className="text-sm text-gray-500">{game.home_team_name}</p>
              <p className="text-3xl font-bold tabular-nums">{currentState.homeScore}</p>
            </div>
          </div>

          {/* Game situation */}
          {!isGameComplete && (
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">Now Batting</p>
                <p className="font-semibold">{battingTeamName}</p>
              </div>
              <GameSituationDisplay
                bases={currentState.bases}
                outs={currentState.outs}
                inning={currentState.inning}
                half={currentState.half}
              />
            </div>
          )}

          {/* Current lineup (simplified view) */}
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-500 mb-2">Batting Order</p>
            <div className="grid grid-cols-3 gap-2 text-sm">
              {startingLineup.map((player, idx) => (
                <div
                  key={player.id}
                  className={`flex items-center gap-2 p-2 rounded ${
                    idx === currentState.currentBatterIndex && !isGameComplete
                      ? "bg-yellow-50 border border-yellow-200"
                      : "bg-gray-50"
                  }`}
                >
                  <span className="font-mono text-gray-400 w-4">{player.batting_order}</span>
                  <span className="truncate flex-1">{player.player_name}</span>
                  {player.defensive_position && (
                    <Badge variant="outline" className="text-xs">
                      {player.defensive_position}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Right: Play entry */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Record Play</CardTitle>
        </CardHeader>
        <CardContent>
          {isGameComplete ? (
            <div className="py-8 text-center text-gray-500">
              <p className="mb-2">Game Complete</p>
              <p className="text-sm">
                Final: {game.away_team_name} {currentState.awayScore} -{" "}
                {game.home_team_name} {currentState.homeScore}
              </p>
            </div>
          ) : !currentBatter || !currentPitcher ? (
            <div className="py-8 text-center text-gray-500">
              <p className="mb-2">Lineup not set</p>
              <p className="text-sm">
                Both teams need a complete batting order and a pitcher to start scoring.
              </p>
            </div>
          ) : isRecording ? (
            <AtBatEntryForm
              batter={currentBatter}
              pitcher={currentPitcher}
              baseState={currentState.bases}
              outs={currentState.outs}
              onSubmit={handleRecordAtBat}
              onCancel={() => setIsRecording(false)}
              isSubmitting={isSaving}
            />
          ) : (
            <div className="space-y-4">
              {/* Current matchup */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">At Bat</span>
                  <span className="text-sm text-gray-500">Pitching</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{currentBatter.player_name}</p>
                    <p className="text-sm text-gray-500">
                      #{currentBatter.batting_order} in order
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{currentPitcher.player_name}</p>
                    <p className="text-sm text-gray-500">{fieldingTeamName}</p>
                  </div>
                </div>
              </div>

              {/* Situation summary */}
              <div className="flex items-center justify-center">
                <BaseRunnersDisplay bases={currentState.bases} size="md" />
              </div>

              <div className="flex justify-center">
                <OutCounter outs={currentState.outs} />
              </div>

              {/* Record button */}
              <Button
                onClick={() => setIsRecording(true)}
                className="w-full"
                size="lg"
              >
                Record At-Bat
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* At-bat history panel */}
      {recentAtBats.length > 0 && (
        <Card className="md:col-span-3">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Play-by-Play History</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
              >
                {showHistory ? "Hide" : "Show"}
              </Button>
            </div>
          </CardHeader>
          {showHistory && (
            <CardContent>
              <div className="space-y-2">
                {recentAtBats.map((ab, idx) => {
                  const batterEntry = [...homeLineup, ...awayLineup].find(
                    (l) => l.id === ab.batter_lineup_id
                  );
                  const resultInfo = AT_BAT_RESULTS[ab.result_type];
                  const isLatest = idx === 0;

                  return (
                    <div
                      key={ab.id}
                      className={`flex items-center justify-between p-3 rounded-lg ${
                        isLatest ? "bg-yellow-50 border border-yellow-200" : "bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-xs text-gray-400 w-16">
                          {ab.half === "top" ? "Top" : "Bot"} {ab.inning}
                        </div>
                        <div>
                          <span className="font-medium">
                            {batterEntry?.player_name ?? "Unknown"}
                          </span>
                          <span className="mx-2 text-gray-400">→</span>
                          <Badge
                            variant={resultInfo?.isOut ? "secondary" : "default"}
                            className="text-xs"
                          >
                            {ab.result_type}
                            {ab.result_detail ? ` (${ab.result_detail})` : ""}
                          </Badge>
                          {ab.rbis > 0 && (
                            <span className="ml-2 text-sm text-green-600">
                              {ab.rbis} RBI
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isLatest && (
                          <Badge variant="outline" className="text-xs">
                            Latest
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDeleteAtBat(ab.id)}
                          disabled={isDeleting === ab.id}
                        >
                          {isDeleting === ab.id ? "Removing..." : "Undo"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {atBats.length > 10 && (
                <p className="text-sm text-gray-500 mt-3 text-center">
                  Showing last 10 at-bats of {atBats.length} total
                </p>
              )}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
