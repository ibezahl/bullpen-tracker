/**
 * Export utilities for scorebook data
 */

import type { FullGameData } from "./db";
import type { AtBat, GameLineupEntry } from "./types";

/**
 * Generate CSV content for game data
 */
export function generateGameCSV(gameData: FullGameData): string {
  const { game, atBats, plays, homeLineup, awayLineup } = gameData;
  const allLineup = [...homeLineup, ...awayLineup];

  // Header row
  const headers = [
    "inning",
    "half",
    "batter_number",
    "team",
    "batter_name",
    "batter_jersey",
    "pitcher_name",
    "result",
    "result_detail",
    "balls",
    "strikes",
    "pitch_count",
    "rbis",
    "hit_location_x",
    "hit_location_y",
    "notes",
  ];

  // Data rows
  const rows = atBats.map((ab) => {
    const batter = allLineup.find((l) => l.id === ab.batter_lineup_id);
    const pitcher = allLineup.find((l) => l.id === ab.pitcher_lineup_id);
    const team = homeLineup.some((l) => l.id === ab.batter_lineup_id) ? "home" : "away";

    return [
      ab.inning,
      ab.half,
      ab.batter_number,
      team,
      batter?.player_name ?? "",
      batter?.jersey_number ?? "",
      pitcher?.player_name ?? "",
      ab.result_type,
      ab.result_detail ?? "",
      ab.balls,
      ab.strikes,
      ab.pitch_count,
      ab.rbis,
      ab.hit_location_x ?? "",
      ab.hit_location_y ?? "",
      ab.notes ?? "",
    ];
  });

  // Escape and join
  const escapeCsv = (val: unknown): string => {
    const str = String(val ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  return [headers.join(","), ...rows.map((row) => row.map(escapeCsv).join(","))].join("\n");
}

/**
 * Generate CSV content for box score stats
 */
export function generateBoxScoreCSV(gameData: FullGameData): string {
  const { game, atBats, plays, homeLineup, awayLineup } = gameData;

  // We'll create a simple batting stats CSV
  const headers = ["team", "batting_order", "player_name", "position", "ab", "r", "h", "rbi", "bb", "k"];

  const rows: (string | number)[][] = [];

  // Helper to count stats
  const getBatterStats = (lineup: GameLineupEntry[], teamName: string) => {
    return lineup
      .filter((l) => l.batting_order !== null && l.batting_order >= 1)
      .sort((a, b) => (a.batting_order ?? 0) - (b.batting_order ?? 0))
      .map((player) => {
        const playerAtBats = atBats.filter((ab) => ab.batter_lineup_id === player.id);
        const playerPlays = plays.filter((p) => p.runner_lineup_id === player.id);

        let ab = 0, h = 0, bb = 0, k = 0, rbi = 0;
        for (const atBat of playerAtBats) {
          const isAtBat = !["BB", "IBB", "HBP", "SAC", "SF", "CI", "INT"].includes(atBat.result_type);
          const isHit = ["1B", "2B", "3B", "HR"].includes(atBat.result_type);
          const isWalk = ["BB", "IBB", "HBP"].includes(atBat.result_type);
          const isK = ["K", "KL"].includes(atBat.result_type);

          if (isAtBat) ab++;
          if (isHit) h++;
          if (isWalk) bb++;
          if (isK) k++;
          rbi += atBat.rbis;
        }

        const r = playerPlays.filter((p) => p.run_scored).length;

        return [
          teamName,
          player.batting_order ?? "",
          player.player_name,
          player.defensive_position ?? "",
          ab,
          r,
          h,
          rbi,
          bb,
          k,
        ];
      });
  };

  rows.push(...getBatterStats(awayLineup, game.away_team_name));
  rows.push(...getBatterStats(homeLineup, game.home_team_name));

  const escapeCsv = (val: unknown): string => {
    const str = String(val ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  return [headers.join(","), ...rows.map((row) => row.map(escapeCsv).join(","))].join("\n");
}

/**
 * Trigger download of CSV file
 */
export function downloadCSV(csvText: string, filename: string): void {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Generate a filename for the game export
 */
export function generateExportFilename(
  awayTeam: string,
  homeTeam: string,
  date: string,
  type: "plays" | "boxscore"
): string {
  const sanitize = (str: string) => str.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
  const dateStr = date.replace(/-/g, "");
  return `${sanitize(awayTeam)}_at_${sanitize(homeTeam)}_${dateStr}_${type}.csv`;
}
