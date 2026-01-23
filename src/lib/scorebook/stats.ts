/**
 * Stats calculation engine for the scorebook
 */

import type {
  AtBat,
  Play,
  GameLineupEntry,
  HalfInning,
  BatterBoxScore,
  PitcherBoxScore,
  AdvancedBatterStats,
  AdvancedPitcherStats,
  LineScore,
  InningSummary,
} from "./types";
import { AT_BAT_RESULTS, getBattingTeam, formatInningsPitched } from "./types";

// ==============================================
// BATTER STATS
// ==============================================

export function computeBatterStats(
  atBats: AtBat[],
  plays: Play[],
  lineupEntry: GameLineupEntry
): BatterBoxScore {
  const playerAtBats = atBats.filter((ab) => ab.batter_lineup_id === lineupEntry.id);
  const playerPlays = plays.filter((p) => p.runner_lineup_id === lineupEntry.id);

  let ab = 0;
  let h = 0;
  let r = 0;
  let rbi = 0;
  let bb = 0;
  let k = 0;

  for (const atBat of playerAtBats) {
    const resultInfo = AT_BAT_RESULTS[atBat.result_type];

    if (resultInfo.isAtBat) ab++;
    if (resultInfo.isHit) h++;

    // Walks/HBP
    if (["BB", "IBB", "HBP"].includes(atBat.result_type)) bb++;

    // Strikeouts
    if (["K", "KL"].includes(atBat.result_type)) k++;

    // RBIs
    rbi += atBat.rbis;
  }

  // Runs scored (from plays where this player scored)
  r = playerPlays.filter((p) => p.run_scored).length;

  const avg = ab > 0 ? h / ab : 0;

  return {
    lineupId: lineupEntry.id,
    playerName: lineupEntry.player_name,
    jerseyNumber: lineupEntry.jersey_number,
    battingOrder: lineupEntry.batting_order ?? 0,
    position: lineupEntry.defensive_position,
    ab,
    r,
    h,
    rbi,
    bb,
    k,
    avg,
  };
}

export function computeAdvancedBatterStats(
  atBats: AtBat[],
  lineupEntry: GameLineupEntry
): AdvancedBatterStats {
  const playerAtBats = atBats.filter((ab) => ab.batter_lineup_id === lineupEntry.id);

  let pa = 0;
  let ab = 0;
  let h = 0;
  let tb = 0;
  let bb = 0;
  let hbp = 0;
  let sf = 0;
  let gidp = 0;

  for (const atBat of playerAtBats) {
    pa++;
    const result = atBat.result_type;
    const resultInfo = AT_BAT_RESULTS[result];

    if (resultInfo.isAtBat) ab++;
    if (resultInfo.isHit) {
      h++;
      // Total bases
      if (result === "1B") tb += 1;
      else if (result === "2B") tb += 2;
      else if (result === "3B") tb += 3;
      else if (result === "HR") tb += 4;
    }

    if (["BB", "IBB"].includes(result)) bb++;
    if (result === "HBP") hbp++;
    if (result === "SF") sf++;
    if (result === "DP") gidp++;
  }

  // OBP = (H + BB + HBP) / (AB + BB + HBP + SF)
  const obpDenom = ab + bb + hbp + sf;
  const obp = obpDenom > 0 ? (h + bb + hbp) / obpDenom : 0;

  // SLG = TB / AB
  const slg = ab > 0 ? tb / ab : 0;

  // OPS = OBP + SLG
  const ops = obp + slg;

  return { obp, slg, ops, pa, tb, hbp, sf, gidp };
}

// ==============================================
// PITCHER STATS
// ==============================================

export function computePitcherStats(
  atBats: AtBat[],
  plays: Play[],
  lineupEntry: GameLineupEntry
): PitcherBoxScore {
  const pitchedAtBats = atBats.filter((ab) => ab.pitcher_lineup_id === lineupEntry.id);

  let outs = 0;
  let h = 0;
  let r = 0;
  let er = 0;
  let bb = 0;
  let k = 0;
  let pc = 0;

  for (const atBat of pitchedAtBats) {
    const result = atBat.result_type;
    const resultInfo = AT_BAT_RESULTS[result];

    // Hits allowed
    if (resultInfo.isHit) h++;

    // Walks allowed
    if (["BB", "IBB"].includes(result)) bb++;

    // Strikeouts
    if (["K", "KL"].includes(result)) k++;

    // Pitch count
    pc += atBat.pitch_count;

    // Count outs from this at-bat
    const atBatPlays = plays.filter((p) => p.at_bat_id === atBat.id);
    for (const play of atBatPlays) {
      if (play.is_out) outs++;
      if (play.run_scored) {
        r++;
        if (play.is_earned_run) er++;
      }
    }
  }

  // Innings pitched
  const ip = outs / 3;
  const ipDisplay = formatInningsPitched(outs);

  // ERA = (ER * 9) / IP
  const era = ip > 0 ? (er * 9) / ip : 0;

  return {
    lineupId: lineupEntry.id,
    playerName: lineupEntry.player_name,
    ip,
    ipDisplay,
    h,
    r,
    er,
    bb,
    k,
    pc,
    era,
  };
}

export function computeAdvancedPitcherStats(
  pitcherBoxScore: PitcherBoxScore
): AdvancedPitcherStats {
  const { ip, h, bb, k } = pitcherBoxScore;

  // WHIP = (BB + H) / IP
  const whip = ip > 0 ? (bb + h) / ip : 0;

  // K/BB ratio
  const kbb = bb > 0 ? k / bb : k;

  // Per 9 innings
  const kPer9 = ip > 0 ? (k * 9) / ip : 0;
  const bbPer9 = ip > 0 ? (bb * 9) / ip : 0;
  const hPer9 = ip > 0 ? (h * 9) / ip : 0;

  return { whip, kbb, kPer9, bbPer9, hPer9 };
}

// ==============================================
// INNING & GAME SUMMARIES
// ==============================================

export function computeInningSummary(
  atBats: AtBat[],
  plays: Play[],
  inning: number,
  half: HalfInning
): Omit<InningSummary, "id" | "user_id" | "game_id"> {
  const inningAtBats = atBats.filter((ab) => ab.inning === inning && ab.half === half);
  const inningAtBatIds = new Set(inningAtBats.map((ab) => ab.id));
  const inningPlays = plays.filter((p) => inningAtBatIds.has(p.at_bat_id));

  let runs = 0;
  let hits = 0;
  let errors = 0;

  for (const play of inningPlays) {
    if (play.run_scored) runs++;
    if (play.error_position) errors++;
  }

  for (const atBat of inningAtBats) {
    if (AT_BAT_RESULTS[atBat.result_type].isHit) hits++;
  }

  return {
    inning,
    half,
    runs,
    hits,
    errors,
    left_on_base: 0, // Would need full base state tracking
    pitcher_changes: 0,
  };
}

export function computeLineScore(
  atBats: AtBat[],
  plays: Play[],
  maxInning: number
): LineScore {
  const homeRuns: number[] = [];
  const awayRuns: number[] = [];
  const homeTotal = { r: 0, h: 0, e: 0 };
  const awayTotal = { r: 0, h: 0, e: 0 };

  for (let i = 1; i <= maxInning; i++) {
    const topSummary = computeInningSummary(atBats, plays, i, "top");
    const bottomSummary = computeInningSummary(atBats, plays, i, "bottom");

    awayRuns.push(topSummary.runs);
    homeRuns.push(bottomSummary.runs);

    awayTotal.r += topSummary.runs;
    awayTotal.h += topSummary.hits;
    awayTotal.e += topSummary.errors;

    homeTotal.r += bottomSummary.runs;
    homeTotal.h += bottomSummary.hits;
    homeTotal.e += bottomSummary.errors;
  }

  return { home: homeRuns, away: awayRuns, homeTotal, awayTotal };
}

// ==============================================
// TEAM STATS
// ==============================================

export function computeTeamBattingStats(
  atBats: AtBat[],
  plays: Play[],
  lineup: GameLineupEntry[]
): {
  batters: BatterBoxScore[];
  totals: { ab: number; r: number; h: number; rbi: number; bb: number; k: number; avg: number };
} {
  // Only include players who batted (have batting order)
  const batters = lineup
    .filter((l) => l.batting_order !== null && l.batting_order >= 1)
    .sort((a, b) => (a.batting_order ?? 0) - (b.batting_order ?? 0))
    .map((l) => computeBatterStats(atBats, plays, l));

  const totals = batters.reduce(
    (acc, b) => ({
      ab: acc.ab + b.ab,
      r: acc.r + b.r,
      h: acc.h + b.h,
      rbi: acc.rbi + b.rbi,
      bb: acc.bb + b.bb,
      k: acc.k + b.k,
      avg: 0,
    }),
    { ab: 0, r: 0, h: 0, rbi: 0, bb: 0, k: 0, avg: 0 }
  );

  totals.avg = totals.ab > 0 ? totals.h / totals.ab : 0;

  return { batters, totals };
}

export function computeTeamPitchingStats(
  atBats: AtBat[],
  plays: Play[],
  lineup: GameLineupEntry[]
): {
  pitchers: PitcherBoxScore[];
  totals: { ip: number; ipDisplay: string; h: number; r: number; er: number; bb: number; k: number; era: number };
} {
  // Find all players who pitched
  const pitcherIds = new Set(atBats.map((ab) => ab.pitcher_lineup_id));
  const pitchers = lineup
    .filter((l) => pitcherIds.has(l.id))
    .map((l) => computePitcherStats(atBats, plays, l));

  let totalOuts = 0;
  const totals = pitchers.reduce(
    (acc, p) => {
      totalOuts += p.ip * 3;
      return {
        ip: 0,
        ipDisplay: "",
        h: acc.h + p.h,
        r: acc.r + p.r,
        er: acc.er + p.er,
        bb: acc.bb + p.bb,
        k: acc.k + p.k,
        era: 0,
      };
    },
    { ip: 0, ipDisplay: "", h: 0, r: 0, er: 0, bb: 0, k: 0, era: 0 }
  );

  totals.ip = totalOuts / 3;
  totals.ipDisplay = formatInningsPitched(Math.round(totalOuts));
  totals.era = totals.ip > 0 ? (totals.er * 9) / totals.ip : 0;

  return { pitchers, totals };
}

// ==============================================
// FORMATTING UTILITIES
// ==============================================

export function formatAverage(avg: number): string {
  if (avg >= 1) return "1.000";
  return avg.toFixed(3).replace(/^0/, "");
}

export function formatERA(era: number): string {
  if (era === 0) return "0.00";
  if (era >= 100) return era.toFixed(0);
  return era.toFixed(2);
}

export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
