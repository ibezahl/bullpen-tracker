"use client";

import { useMemo } from "react";
import type { FullGameData } from "@/lib/scorebook/db";
import type { AtBat, GameLineupEntry, Play, AtBatResultType } from "@/lib/scorebook/types";
import { AT_BAT_RESULTS } from "@/lib/scorebook/types";
import { getStartingLineup } from "@/lib/scorebook/gameState";
import {
  computeTeamBattingStats,
  computeLineScore,
} from "@/lib/scorebook/stats";

type Props = {
  gameData: FullGameData;
  teamSide: "home" | "away";
};

type InningAtBatInfo = {
  resultType: AtBatResultType;
  resultDetail: string | null;
  rbis: number;
  pitchCount: number;
  runScored: boolean;
};

/**
 * Get symbol for an at-bat result (traditional scoring notation)
 */
function getResultSymbol(resultType: AtBatResultType, detail: string | null): string {
  switch (resultType) {
    case "1B":
      return "1B";
    case "2B":
      return "2B";
    case "3B":
      return "3B";
    case "HR":
      return "HR";
    case "BB":
      return "BB";
    case "IBB":
      return "IBB";
    case "HBP":
      return "HBP";
    case "K":
      return "K";
    case "KL":
      return "Ꝁ"; // K with strikethrough for looking
    case "GO":
      return detail || "GO";
    case "FO":
      return detail || "FO";
    case "LO":
      return detail || "LO";
    case "PO":
      return detail || "PO";
    case "FC":
      return "FC";
    case "DP":
      return "DP";
    case "TP":
      return "TP";
    case "SAC":
      return "SAC";
    case "SF":
      return "SF";
    case "E":
      return detail ? `E${detail}` : "E";
    case "CI":
      return "CI";
    case "INT":
      return "INT";
    default:
      return resultType;
  }
}

/**
 * Diamond box component for a single at-bat
 */
function DiamondBox({
  atBatInfo,
  isEmpty,
  batterIndex,
  inning,
}: {
  atBatInfo: InningAtBatInfo | null;
  isEmpty: boolean;
  batterIndex: number;
  inning: number;
}) {
  if (isEmpty || !atBatInfo) {
    return (
      <div className="w-14 h-14 border border-gray-200 flex items-center justify-center bg-white">
        <svg viewBox="0 0 40 40" className="w-10 h-10 text-gray-200">
          {/* Diamond shape */}
          <path
            d="M20 5 L35 20 L20 35 L5 20 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
        </svg>
      </div>
    );
  }

  const resultInfo = AT_BAT_RESULTS[atBatInfo.resultType];
  const symbol = getResultSymbol(atBatInfo.resultType, atBatInfo.resultDetail);
  const isHit = resultInfo?.isHit;
  const isOut = resultInfo?.isOut;

  // Determine which bases to fill based on result
  let fillFirst = false;
  let fillSecond = false;
  let fillThird = false;
  let fillHome = false;

  switch (atBatInfo.resultType) {
    case "1B":
    case "BB":
    case "IBB":
    case "HBP":
    case "E":
    case "FC":
    case "CI":
    case "INT":
      fillFirst = true;
      break;
    case "2B":
      fillFirst = true;
      fillSecond = true;
      break;
    case "3B":
      fillFirst = true;
      fillSecond = true;
      fillThird = true;
      break;
    case "HR":
      fillFirst = true;
      fillSecond = true;
      fillThird = true;
      fillHome = true;
      break;
  }

  // If run scored (e.g., came around to score later), fill home
  if (atBatInfo.runScored) {
    fillHome = true;
  }

  return (
    <div
      className={`w-14 h-14 border border-gray-300 flex flex-col items-center justify-center relative ${
        isHit ? "bg-green-50" : isOut ? "bg-gray-50" : "bg-white"
      }`}
    >
      {/* Diamond with base paths */}
      <svg viewBox="0 0 40 40" className="w-9 h-9">
        {/* Base paths */}
        <path
          d="M20 5 L35 20"
          fill="none"
          stroke={fillFirst ? "#22c55e" : "#d1d5db"}
          strokeWidth={fillFirst ? "2.5" : "1"}
        />
        <path
          d="M35 20 L20 35"
          fill="none"
          stroke={fillSecond ? "#22c55e" : "#d1d5db"}
          strokeWidth={fillSecond ? "2.5" : "1"}
        />
        <path
          d="M20 35 L5 20"
          fill="none"
          stroke={fillThird ? "#22c55e" : "#d1d5db"}
          strokeWidth={fillThird ? "2.5" : "1"}
        />
        <path
          d="M5 20 L20 5"
          fill="none"
          stroke={fillHome ? "#22c55e" : "#d1d5db"}
          strokeWidth={fillHome ? "2.5" : "1"}
        />
        {/* Home plate (bottom) */}
        <circle
          cx="20"
          cy="35"
          r="2.5"
          fill={fillHome ? "#22c55e" : "white"}
          stroke="#9ca3af"
          strokeWidth="1"
        />
        {/* First base (right) */}
        <rect
          x="33"
          y="18"
          width="4"
          height="4"
          fill={fillFirst ? "#22c55e" : "white"}
          stroke="#9ca3af"
          strokeWidth="1"
        />
        {/* Second base (top) */}
        <rect
          x="18"
          y="3"
          width="4"
          height="4"
          transform="rotate(45 20 5)"
          fill={fillSecond ? "#22c55e" : "white"}
          stroke="#9ca3af"
          strokeWidth="1"
        />
        {/* Third base (left) */}
        <rect
          x="3"
          y="18"
          width="4"
          height="4"
          fill={fillThird ? "#22c55e" : "white"}
          stroke="#9ca3af"
          strokeWidth="1"
        />
      </svg>
      {/* Result text */}
      <span
        className={`text-[10px] font-bold absolute bottom-0.5 ${
          isHit ? "text-green-700" : isOut ? "text-gray-600" : "text-blue-600"
        }`}
      >
        {symbol}
      </span>
      {/* RBI indicator */}
      {atBatInfo.rbis > 0 && (
        <span className="absolute top-0.5 right-0.5 text-[8px] text-green-600 font-bold">
          {atBatInfo.rbis}
        </span>
      )}
    </div>
  );
}

export function TraditionalScoresheet({ gameData, teamSide }: Props) {
  const { game, homeLineup, awayLineup, atBats, plays } = gameData;

  const lineup = teamSide === "home" ? homeLineup : awayLineup;
  const teamName = teamSide === "home" ? game.home_team_name : game.away_team_name;
  const battingHalf = teamSide === "home" ? "bottom" : "top";

  // Get starting lineup (positions 1-9)
  const startingLineup = getStartingLineup(lineup);

  // Get max innings to display
  const maxInning = Math.max(
    game.innings_scheduled,
    game.current_inning,
    ...atBats.map((ab) => ab.inning)
  );
  const innings = Array.from({ length: maxInning }, (_, i) => i + 1);

  // Build a map of at-bats per lineup position per inning
  const atBatsByBatter = useMemo(() => {
    const map = new Map<string, Map<number, InningAtBatInfo>>();

    // Filter at-bats for this team's batting half
    const teamAtBats = atBats.filter((ab) => ab.half === battingHalf);

    for (const ab of teamAtBats) {
      const lineupId = ab.batter_lineup_id;
      if (!map.has(lineupId)) {
        map.set(lineupId, new Map());
      }

      // Check if run scored
      const atBatPlays = plays.filter((p) => p.at_bat_id === ab.id);
      const runScored = atBatPlays.some((p) => p.run_scored && p.runner_lineup_id === lineupId);

      map.get(lineupId)!.set(ab.inning, {
        resultType: ab.result_type,
        resultDetail: ab.result_detail,
        rbis: ab.rbis,
        pitchCount: ab.pitch_count,
        runScored,
      });
    }

    return map;
  }, [atBats, plays, battingHalf]);

  // Calculate batting stats
  const battingStats = useMemo(() => {
    return computeTeamBattingStats(atBats, plays, lineup);
  }, [atBats, plays, lineup]);

  // Line score for this team
  const lineScore = useMemo(() => {
    return computeLineScore(atBats, plays, maxInning);
  }, [atBats, plays, maxInning]);

  const teamLineScore = teamSide === "home" ? lineScore.home : lineScore.away;
  const teamTotals = teamSide === "home" ? lineScore.homeTotal : lineScore.awayTotal;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-fit">
        {/* Header */}
        <div className="flex items-center gap-4 mb-4 print:mb-2">
          <h2 className="text-xl font-bold">{teamName}</h2>
          <span className="text-gray-500">
            {teamSide === "home" ? "(Home)" : "(Away)"}
          </span>
        </div>

        {/* Scoresheet grid */}
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="border border-gray-300 px-2 py-1 text-left text-xs font-medium bg-gray-100 w-8">
                #
              </th>
              <th className="border border-gray-300 px-2 py-1 text-left text-xs font-medium bg-gray-100 w-32">
                Player
              </th>
              <th className="border border-gray-300 px-2 py-1 text-center text-xs font-medium bg-gray-100 w-10">
                Pos
              </th>
              {innings.map((inning) => (
                <th
                  key={inning}
                  className="border border-gray-300 px-1 py-1 text-center text-xs font-medium bg-gray-100 w-14"
                >
                  {inning}
                </th>
              ))}
              <th className="border border-gray-300 px-2 py-1 text-center text-xs font-medium bg-gray-200 w-8">
                AB
              </th>
              <th className="border border-gray-300 px-2 py-1 text-center text-xs font-medium bg-gray-200 w-8">
                R
              </th>
              <th className="border border-gray-300 px-2 py-1 text-center text-xs font-medium bg-gray-200 w-8">
                H
              </th>
              <th className="border border-gray-300 px-2 py-1 text-center text-xs font-medium bg-gray-200 w-8">
                RBI
              </th>
              <th className="border border-gray-300 px-2 py-1 text-center text-xs font-medium bg-gray-200 w-8">
                BB
              </th>
              <th className="border border-gray-300 px-2 py-1 text-center text-xs font-medium bg-gray-200 w-8">
                K
              </th>
            </tr>
          </thead>
          <tbody>
            {startingLineup.map((player, idx) => {
              const batterAtBats = atBatsByBatter.get(player.id);
              const playerStats = battingStats.batters.find(
                (b) => b.lineupId === player.id
              );

              return (
                <tr key={player.id}>
                  <td className="border border-gray-300 px-2 py-1 text-center text-sm font-medium bg-gray-50">
                    {player.batting_order}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-sm truncate max-w-[120px]">
                    {player.jersey_number && (
                      <span className="text-gray-400 mr-1">#{player.jersey_number}</span>
                    )}
                    {player.player_name}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-center text-xs text-gray-600">
                    {player.defensive_position || "-"}
                  </td>
                  {innings.map((inning) => {
                    const atBatInfo = batterAtBats?.get(inning) ?? null;
                    return (
                      <td key={inning} className="border border-gray-300 p-0">
                        <DiamondBox
                          atBatInfo={atBatInfo}
                          isEmpty={!atBatInfo}
                          batterIndex={idx}
                          inning={inning}
                        />
                      </td>
                    );
                  })}
                  <td className="border border-gray-300 px-2 py-1 text-center text-sm tabular-nums bg-gray-50">
                    {playerStats?.ab ?? 0}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-center text-sm tabular-nums bg-gray-50">
                    {playerStats?.r ?? 0}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-center text-sm tabular-nums bg-gray-50">
                    {playerStats?.h ?? 0}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-center text-sm tabular-nums bg-gray-50">
                    {playerStats?.rbi ?? 0}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-center text-sm tabular-nums bg-gray-50">
                    {playerStats?.bb ?? 0}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-center text-sm tabular-nums bg-gray-50">
                    {playerStats?.k ?? 0}
                  </td>
                </tr>
              );
            })}
            {/* Totals row */}
            <tr className="font-semibold">
              <td
                colSpan={3}
                className="border border-gray-300 px-2 py-1 text-right text-sm bg-gray-100"
              >
                TOTALS
              </td>
              {innings.map((inning) => (
                <td
                  key={inning}
                  className="border border-gray-300 px-2 py-2 text-center text-sm bg-gray-100"
                >
                  <span className="font-bold">{teamLineScore[inning - 1] ?? "-"}</span>
                </td>
              ))}
              <td className="border border-gray-300 px-2 py-1 text-center text-sm tabular-nums bg-gray-200">
                {battingStats.totals.ab}
              </td>
              <td className="border border-gray-300 px-2 py-1 text-center text-sm tabular-nums bg-gray-200">
                {teamTotals.r}
              </td>
              <td className="border border-gray-300 px-2 py-1 text-center text-sm tabular-nums bg-gray-200">
                {teamTotals.h}
              </td>
              <td className="border border-gray-300 px-2 py-1 text-center text-sm tabular-nums bg-gray-200">
                {battingStats.totals.rbi}
              </td>
              <td className="border border-gray-300 px-2 py-1 text-center text-sm tabular-nums bg-gray-200">
                {battingStats.totals.bb}
              </td>
              <td className="border border-gray-300 px-2 py-1 text-center text-sm tabular-nums bg-gray-200">
                {battingStats.totals.k}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Legend */}
        <div className="mt-4 text-xs text-gray-500 print:mt-2">
          <p className="font-medium mb-1">Legend:</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>1B = Single</span>
            <span>2B = Double</span>
            <span>3B = Triple</span>
            <span>HR = Home Run</span>
            <span>BB = Walk</span>
            <span>K = Strikeout</span>
            <span>Ꝁ = Strikeout Looking</span>
            <span>E = Error</span>
            <span>FC = Fielder&apos;s Choice</span>
            <span>SAC = Sacrifice</span>
            <span>SF = Sac Fly</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Full game scoresheet showing both teams
 */
export function FullGameScoresheet({ gameData }: { gameData: FullGameData }) {
  const { game } = gameData;

  return (
    <div className="space-y-8 print:space-y-4">
      {/* Game header */}
      <div className="text-center border-b pb-4 print:pb-2">
        <h1 className="text-2xl font-bold">
          {game.away_team_name} @ {game.home_team_name}
        </h1>
        <p className="text-gray-600">
          {new Date(game.game_date).toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
          {game.location && ` • ${game.location}`}
        </p>
        <p className="text-xl font-bold mt-2">
          Final: {game.away_team_name} {game.away_final_score} - {game.home_team_name}{" "}
          {game.home_final_score}
        </p>
      </div>

      {/* Away team scoresheet */}
      <TraditionalScoresheet gameData={gameData} teamSide="away" />

      {/* Home team scoresheet */}
      <TraditionalScoresheet gameData={gameData} teamSide="home" />
    </div>
  );
}
