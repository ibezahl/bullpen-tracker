/**
 * Game state management utilities for the scorebook
 */

import type {
  Game,
  GameLineupEntry,
  AtBat,
  Play,
  Substitution,
  InningSummary,
  BaseState,
  HalfInning,
  TeamSide,
  AtBatResultType,
  AT_BAT_RESULTS,
} from "./types";
import { getBattingTeam, getFieldingTeam } from "./types";

export type GameState = {
  game: Game;
  homeLineup: GameLineupEntry[];
  awayLineup: GameLineupEntry[];
  atBats: AtBat[];
  plays: Play[];
  substitutions: Substitution[];
  inningSummaries: InningSummary[];
};

export type CurrentGameState = {
  inning: number;
  half: HalfInning;
  outs: number;
  bases: BaseState;
  battingTeam: TeamSide;
  fieldingTeam: TeamSide;
  currentBatterIndex: number; // 0-8 for lineup position
  homeScore: number;
  awayScore: number;
};

/**
 * Get the active lineup (starters and subs who have entered)
 */
export function getActiveLineup(
  lineup: GameLineupEntry[],
  inning: number,
  half: HalfInning
): GameLineupEntry[] {
  return lineup
    .filter((entry) => {
      if (!entry.is_active) return false;
      // Check if they've entered the game yet
      if (entry.entry_inning > inning) return false;
      if (entry.entry_inning === inning && half === "top" && entry.entry_half === "bottom") {
        return false;
      }
      return true;
    })
    .sort((a, b) => (a.batting_order ?? 99) - (b.batting_order ?? 99));
}

/**
 * Get the starting lineup (batting order 1-9)
 */
export function getStartingLineup(lineup: GameLineupEntry[]): GameLineupEntry[] {
  return lineup
    .filter((entry) => entry.batting_order !== null && entry.batting_order >= 1 && entry.batting_order <= 9)
    .sort((a, b) => (a.batting_order ?? 0) - (b.batting_order ?? 0));
}

/**
 * Get the current pitcher for a team
 */
export function getCurrentPitcher(lineup: GameLineupEntry[]): GameLineupEntry | null {
  return lineup.find((entry) => entry.is_active && entry.defensive_position === "P") ?? null;
}

/**
 * Calculate base state from at-bats and plays in current half-inning
 */
export function calculateBaseState(
  atBats: AtBat[],
  plays: Play[],
  inning: number,
  half: HalfInning,
  lineup: GameLineupEntry[]
): BaseState {
  const baseState: BaseState = { first: null, second: null, third: null };

  // Get all at-bats in this half inning
  const inningAtBats = atBats
    .filter((ab) => ab.inning === inning && ab.half === half)
    .sort((a, b) => a.batter_number - b.batter_number);

  // Process each at-bat and its plays to determine current base state
  for (const atBat of inningAtBats) {
    const atBatPlays = plays
      .filter((p) => p.at_bat_id === atBat.id)
      .sort((a, b) => a.play_sequence - b.play_sequence);

    // Process plays to update base state
    for (const play of atBatPlays) {
      if (play.is_out) {
        // Remove runner from base if they were out
        if (play.from_base === "1") baseState.first = null;
        if (play.from_base === "2") baseState.second = null;
        if (play.from_base === "3") baseState.third = null;
      } else if (play.run_scored) {
        // Runner scored, remove from base
        if (play.from_base === "1") baseState.first = null;
        if (play.from_base === "2") baseState.second = null;
        if (play.from_base === "3") baseState.third = null;
      } else if (play.to_base && play.runner_lineup_id) {
        // Runner advanced
        const runner = lineup.find((l) => l.id === play.runner_lineup_id) ?? null;
        if (play.from_base === "1") baseState.first = null;
        if (play.from_base === "2") baseState.second = null;
        if (play.from_base === "3") baseState.third = null;

        if (play.to_base === "1") baseState.first = runner;
        if (play.to_base === "2") baseState.second = runner;
        if (play.to_base === "3") baseState.third = runner;
      }
    }
  }

  return baseState;
}

/**
 * Calculate current outs in the half inning
 */
export function calculateOuts(atBats: AtBat[], plays: Play[], inning: number, half: HalfInning): number {
  const inningPlays = plays.filter((p) => {
    const atBat = atBats.find((ab) => ab.id === p.at_bat_id);
    return atBat && atBat.inning === inning && atBat.half === half;
  });

  return inningPlays.filter((p) => p.is_out).length;
}

/**
 * Calculate the next batter index (0-8)
 */
export function calculateNextBatterIndex(
  atBats: AtBat[],
  inning: number,
  half: HalfInning,
  teamSide: TeamSide
): number {
  // Get all at-bats for this team in the game so far
  const teamAtBats = atBats.filter((ab) => {
    // Determine which team was batting
    const battingTeam = getBattingTeam(ab.half);
    return battingTeam === teamSide;
  });

  if (teamAtBats.length === 0) return 0;

  // Find the last at-bat and return the next batting order position
  const lastAtBat = teamAtBats[teamAtBats.length - 1];
  // Get the lineup entry to find their batting order
  // The batter_number in at-bat is the sequence in the inning, not the batting order
  // We need to track which lineup spot batted last

  // Count total plate appearances for this team
  const totalPA = teamAtBats.length;
  // Batting order is 1-9, index is 0-8
  return totalPA % 9;
}

/**
 * Calculate scores from plays
 */
export function calculateScores(
  atBats: AtBat[],
  plays: Play[]
): { homeScore: number; awayScore: number } {
  let homeScore = 0;
  let awayScore = 0;

  for (const play of plays) {
    if (play.run_scored) {
      const atBat = atBats.find((ab) => ab.id === play.at_bat_id);
      if (atBat) {
        const battingTeam = getBattingTeam(atBat.half);
        if (battingTeam === "home") {
          homeScore++;
        } else {
          awayScore++;
        }
      }
    }
  }

  return { homeScore, awayScore };
}

/**
 * Get the full current game state
 */
export function getCurrentGameState(
  game: Game,
  homeLineup: GameLineupEntry[],
  awayLineup: GameLineupEntry[],
  atBats: AtBat[],
  plays: Play[]
): CurrentGameState {
  const inning = game.current_inning;
  const half = game.current_half;
  const battingTeam = getBattingTeam(half);
  const fieldingTeam = getFieldingTeam(half);
  const battingLineup = battingTeam === "home" ? homeLineup : awayLineup;

  const outs = calculateOuts(atBats, plays, inning, half);
  const bases = calculateBaseState(atBats, plays, inning, half, battingLineup);
  const currentBatterIndex = calculateNextBatterIndex(atBats, inning, half, battingTeam);
  const { homeScore, awayScore } = calculateScores(atBats, plays);

  return {
    inning,
    half,
    outs,
    bases,
    battingTeam,
    fieldingTeam,
    currentBatterIndex,
    homeScore,
    awayScore,
  };
}

/**
 * Determine if the half-inning should end (3 outs)
 */
export function shouldAdvanceHalfInning(outs: number): boolean {
  return outs >= 3;
}

/**
 * Get the next half-inning state
 */
export function getNextHalfInning(
  inning: number,
  half: HalfInning
): { inning: number; half: HalfInning } {
  if (half === "top") {
    return { inning, half: "bottom" };
  } else {
    return { inning: inning + 1, half: "top" };
  }
}

/**
 * Get number of outs that will result from an at-bat result
 */
export function getOutsFromResult(resultType: AtBatResultType): number {
  // Import the result info
  const resultInfo = {
    "1B": { isOut: false },
    "2B": { isOut: false },
    "3B": { isOut: false },
    HR: { isOut: false },
    GO: { isOut: true },
    FO: { isOut: true },
    LO: { isOut: true },
    PO: { isOut: true },
    K: { isOut: true },
    KL: { isOut: true },
    FC: { isOut: false }, // Batter safe, but runner out
    DP: { isOut: true }, // 2 outs
    TP: { isOut: true }, // 3 outs
    SAC: { isOut: true },
    SF: { isOut: true },
    BB: { isOut: false },
    IBB: { isOut: false },
    HBP: { isOut: false },
    E: { isOut: false },
    CI: { isOut: false },
    INT: { isOut: false },
  } as const;

  const info = resultInfo[resultType];
  if (!info.isOut) return 0;
  if (resultType === "DP") return 2;
  if (resultType === "TP") return 3;
  return 1;
}

/**
 * Calculate what inning/half the game should be in based on at-bats and plays
 * This is useful after deleting an at-bat to recalculate the correct game state
 */
export function calculateCorrectInningState(
  atBats: AtBat[],
  plays: Play[]
): { inning: number; half: HalfInning } {
  if (atBats.length === 0) {
    return { inning: 1, half: "top" };
  }

  // Find the latest at-bat by inning, half, and batter number
  const sortedAtBats = [...atBats].sort((a, b) => {
    if (a.inning !== b.inning) return b.inning - a.inning;
    if (a.half !== b.half) return a.half === "bottom" ? -1 : 1;
    return b.batter_number - a.batter_number;
  });

  const latestAtBat = sortedAtBats[0];
  const currentInning = latestAtBat.inning;
  const currentHalf = latestAtBat.half;

  // Calculate outs in this half-inning
  const outs = calculateOuts(atBats, plays, currentInning, currentHalf);

  // If 3+ outs, we should be in the next half-inning
  if (outs >= 3) {
    return getNextHalfInning(currentInning, currentHalf);
  }

  // Otherwise stay in current half-inning
  return { inning: currentInning, half: currentHalf };
}

/**
 * Get base advancement for batter based on result
 */
export function getBatterBaseAdvancement(resultType: AtBatResultType): "1" | "2" | "3" | "H" | "OUT" | null {
  switch (resultType) {
    case "1B":
    case "BB":
    case "IBB":
    case "HBP":
    case "E":
    case "CI":
    case "INT":
    case "FC":
      return "1";
    case "2B":
      return "2";
    case "3B":
      return "3";
    case "HR":
      return "H";
    case "GO":
    case "FO":
    case "LO":
    case "PO":
    case "K":
    case "KL":
    case "DP":
    case "TP":
    case "SAC":
    case "SF":
      return "OUT";
    default:
      return null;
  }
}
