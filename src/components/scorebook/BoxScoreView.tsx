"use client";

import type { FullGameData } from "@/lib/scorebook/db";
import type { BatterBoxScore, PitcherBoxScore, LineScore } from "@/lib/scorebook/types";
import {
  computeTeamBattingStats,
  computeTeamPitchingStats,
  computeLineScore,
  formatAverage,
  formatERA,
} from "@/lib/scorebook/stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Props = {
  gameData: FullGameData;
};

export function BoxScoreView({ gameData }: Props) {
  const { game, homeLineup, awayLineup, atBats, plays } = gameData;

  // Compute stats
  const awayBatting = computeTeamBattingStats(atBats, plays, awayLineup);
  const homeBatting = computeTeamBattingStats(atBats, plays, homeLineup);
  const awayPitching = computeTeamPitchingStats(atBats, plays, awayLineup);
  const homePitching = computeTeamPitchingStats(atBats, plays, homeLineup);

  const maxInning = Math.max(
    game.current_inning,
    ...atBats.map((ab) => ab.inning)
  );
  const lineScore = computeLineScore(atBats, plays, maxInning || game.innings_scheduled);

  return (
    <div className="space-y-6">
      {/* Line Score */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Line Score</CardTitle>
        </CardHeader>
        <CardContent>
          <LinescoreTable
            awayTeam={game.away_team_name}
            homeTeam={game.home_team_name}
            lineScore={lineScore}
            maxInning={maxInning || game.innings_scheduled}
          />
        </CardContent>
      </Card>

      {/* Batting Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{game.away_team_name} Batting</CardTitle>
          </CardHeader>
          <CardContent>
            <BatterStatsTable
              batters={awayBatting.batters}
              totals={awayBatting.totals}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{game.home_team_name} Batting</CardTitle>
          </CardHeader>
          <CardContent>
            <BatterStatsTable
              batters={homeBatting.batters}
              totals={homeBatting.totals}
            />
          </CardContent>
        </Card>
      </div>

      {/* Pitching Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{game.away_team_name} Pitching</CardTitle>
          </CardHeader>
          <CardContent>
            <PitcherStatsTable
              pitchers={awayPitching.pitchers}
              totals={awayPitching.totals}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{game.home_team_name} Pitching</CardTitle>
          </CardHeader>
          <CardContent>
            <PitcherStatsTable
              pitchers={homePitching.pitchers}
              totals={homePitching.totals}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ==============================================
// SUB-COMPONENTS
// ==============================================

function LinescoreTable({
  awayTeam,
  homeTeam,
  lineScore,
  maxInning,
}: {
  awayTeam: string;
  homeTeam: string;
  lineScore: LineScore;
  maxInning: number;
}) {
  const innings = Array.from({ length: maxInning }, (_, i) => i + 1);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 px-2 font-medium">Team</th>
            {innings.map((i) => (
              <th key={i} className="text-center py-2 px-2 font-medium w-8">
                {i}
              </th>
            ))}
            <th className="text-center py-2 px-2 font-bold border-l w-10">R</th>
            <th className="text-center py-2 px-2 font-bold w-10">H</th>
            <th className="text-center py-2 px-2 font-bold w-10">E</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-2 px-2 font-medium">{awayTeam}</td>
            {innings.map((i) => (
              <td key={i} className="text-center py-2 px-2 tabular-nums">
                {lineScore.away[i - 1] ?? "-"}
              </td>
            ))}
            <td className="text-center py-2 px-2 font-bold border-l tabular-nums">
              {lineScore.awayTotal.r}
            </td>
            <td className="text-center py-2 px-2 font-bold tabular-nums">
              {lineScore.awayTotal.h}
            </td>
            <td className="text-center py-2 px-2 font-bold tabular-nums">
              {lineScore.awayTotal.e}
            </td>
          </tr>
          <tr>
            <td className="py-2 px-2 font-medium">{homeTeam}</td>
            {innings.map((i) => (
              <td key={i} className="text-center py-2 px-2 tabular-nums">
                {lineScore.home[i - 1] ?? "-"}
              </td>
            ))}
            <td className="text-center py-2 px-2 font-bold border-l tabular-nums">
              {lineScore.homeTotal.r}
            </td>
            <td className="text-center py-2 px-2 font-bold tabular-nums">
              {lineScore.homeTotal.h}
            </td>
            <td className="text-center py-2 px-2 font-bold tabular-nums">
              {lineScore.homeTotal.e}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BatterStatsTable({
  batters,
  totals,
}: {
  batters: BatterBoxScore[];
  totals: { ab: number; r: number; h: number; rbi: number; bb: number; k: number; avg: number };
}) {
  if (batters.length === 0) {
    return <p className="text-gray-500 text-sm py-4 text-center">No at-bats recorded</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-gray-500">
            <th className="text-left py-2 px-1 font-medium">Player</th>
            <th className="text-center py-2 px-1 font-medium w-8">AB</th>
            <th className="text-center py-2 px-1 font-medium w-8">R</th>
            <th className="text-center py-2 px-1 font-medium w-8">H</th>
            <th className="text-center py-2 px-1 font-medium w-8">RBI</th>
            <th className="text-center py-2 px-1 font-medium w-8">BB</th>
            <th className="text-center py-2 px-1 font-medium w-8">K</th>
            <th className="text-center py-2 px-1 font-medium w-12">AVG</th>
          </tr>
        </thead>
        <tbody>
          {batters.map((batter) => (
            <tr key={batter.lineupId} className="border-b border-gray-100">
              <td className="py-2 px-1">
                <div className="flex items-center gap-1">
                  <span className="text-gray-400 w-4">{batter.battingOrder}</span>
                  <span className="truncate">{batter.playerName}</span>
                  {batter.position && (
                    <Badge variant="outline" className="text-xs ml-1">
                      {batter.position}
                    </Badge>
                  )}
                </div>
              </td>
              <td className="text-center py-2 px-1 tabular-nums">{batter.ab}</td>
              <td className="text-center py-2 px-1 tabular-nums">{batter.r}</td>
              <td className="text-center py-2 px-1 tabular-nums">{batter.h}</td>
              <td className="text-center py-2 px-1 tabular-nums">{batter.rbi}</td>
              <td className="text-center py-2 px-1 tabular-nums">{batter.bb}</td>
              <td className="text-center py-2 px-1 tabular-nums">{batter.k}</td>
              <td className="text-center py-2 px-1 tabular-nums font-mono text-xs">
                {formatAverage(batter.avg)}
              </td>
            </tr>
          ))}
          {/* Totals row */}
          <tr className="font-semibold bg-gray-50">
            <td className="py-2 px-1">Totals</td>
            <td className="text-center py-2 px-1 tabular-nums">{totals.ab}</td>
            <td className="text-center py-2 px-1 tabular-nums">{totals.r}</td>
            <td className="text-center py-2 px-1 tabular-nums">{totals.h}</td>
            <td className="text-center py-2 px-1 tabular-nums">{totals.rbi}</td>
            <td className="text-center py-2 px-1 tabular-nums">{totals.bb}</td>
            <td className="text-center py-2 px-1 tabular-nums">{totals.k}</td>
            <td className="text-center py-2 px-1 tabular-nums font-mono text-xs">
              {formatAverage(totals.avg)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function PitcherStatsTable({
  pitchers,
  totals,
}: {
  pitchers: PitcherBoxScore[];
  totals: { ip: number; ipDisplay: string; h: number; r: number; er: number; bb: number; k: number; era: number };
}) {
  if (pitchers.length === 0) {
    return <p className="text-gray-500 text-sm py-4 text-center">No pitching recorded</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-gray-500">
            <th className="text-left py-2 px-1 font-medium">Pitcher</th>
            <th className="text-center py-2 px-1 font-medium w-10">IP</th>
            <th className="text-center py-2 px-1 font-medium w-8">H</th>
            <th className="text-center py-2 px-1 font-medium w-8">R</th>
            <th className="text-center py-2 px-1 font-medium w-8">ER</th>
            <th className="text-center py-2 px-1 font-medium w-8">BB</th>
            <th className="text-center py-2 px-1 font-medium w-8">K</th>
            <th className="text-center py-2 px-1 font-medium w-12">ERA</th>
          </tr>
        </thead>
        <tbody>
          {pitchers.map((pitcher) => (
            <tr key={pitcher.lineupId} className="border-b border-gray-100">
              <td className="py-2 px-1 truncate">{pitcher.playerName}</td>
              <td className="text-center py-2 px-1 tabular-nums">{pitcher.ipDisplay}</td>
              <td className="text-center py-2 px-1 tabular-nums">{pitcher.h}</td>
              <td className="text-center py-2 px-1 tabular-nums">{pitcher.r}</td>
              <td className="text-center py-2 px-1 tabular-nums">{pitcher.er}</td>
              <td className="text-center py-2 px-1 tabular-nums">{pitcher.bb}</td>
              <td className="text-center py-2 px-1 tabular-nums">{pitcher.k}</td>
              <td className="text-center py-2 px-1 tabular-nums font-mono text-xs">
                {formatERA(pitcher.era)}
              </td>
            </tr>
          ))}
          {/* Totals row */}
          <tr className="font-semibold bg-gray-50">
            <td className="py-2 px-1">Totals</td>
            <td className="text-center py-2 px-1 tabular-nums">{totals.ipDisplay}</td>
            <td className="text-center py-2 px-1 tabular-nums">{totals.h}</td>
            <td className="text-center py-2 px-1 tabular-nums">{totals.r}</td>
            <td className="text-center py-2 px-1 tabular-nums">{totals.er}</td>
            <td className="text-center py-2 px-1 tabular-nums">{totals.bb}</td>
            <td className="text-center py-2 px-1 tabular-nums">{totals.k}</td>
            <td className="text-center py-2 px-1 tabular-nums font-mono text-xs">
              {formatERA(totals.era)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
