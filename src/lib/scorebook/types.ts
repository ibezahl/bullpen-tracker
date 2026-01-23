// ==============================================
// SCOREBOOK TYPES
// ==============================================

// ==============================================
// ENUMS & CONSTANTS
// ==============================================

export const POSITIONS = {
  P: "Pitcher",
  C: "Catcher",
  "1B": "First Base",
  "2B": "Second Base",
  "3B": "Third Base",
  SS: "Shortstop",
  LF: "Left Field",
  CF: "Center Field",
  RF: "Right Field",
  DH: "Designated Hitter",
} as const;

export type Position = keyof typeof POSITIONS;

export const POSITION_NUMBERS: Record<Position, number> = {
  P: 1,
  C: 2,
  "1B": 3,
  "2B": 4,
  "3B": 5,
  SS: 6,
  LF: 7,
  CF: 8,
  RF: 9,
  DH: 0,
};

export const POSITION_LIST: Position[] = [
  "P",
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "LF",
  "CF",
  "RF",
  "DH",
];

export const AT_BAT_RESULTS = {
  // Hits
  "1B": { label: "Single", isHit: true, isAtBat: true, isOut: false },
  "2B": { label: "Double", isHit: true, isAtBat: true, isOut: false },
  "3B": { label: "Triple", isHit: true, isAtBat: true, isOut: false },
  HR: { label: "Home Run", isHit: true, isAtBat: true, isOut: false },
  // Outs
  GO: { label: "Ground Out", isHit: false, isAtBat: true, isOut: true },
  FO: { label: "Fly Out", isHit: false, isAtBat: true, isOut: true },
  LO: { label: "Line Out", isHit: false, isAtBat: true, isOut: true },
  PO: { label: "Pop Out", isHit: false, isAtBat: true, isOut: true },
  K: { label: "Strikeout (Swinging)", isHit: false, isAtBat: true, isOut: true },
  KL: { label: "Strikeout (Looking)", isHit: false, isAtBat: true, isOut: true },
  FC: { label: "Fielder's Choice", isHit: false, isAtBat: true, isOut: false },
  DP: { label: "Double Play", isHit: false, isAtBat: true, isOut: true },
  TP: { label: "Triple Play", isHit: false, isAtBat: true, isOut: true },
  SAC: { label: "Sacrifice Bunt", isHit: false, isAtBat: false, isOut: true },
  SF: { label: "Sacrifice Fly", isHit: false, isAtBat: false, isOut: true },
  // Walks/HBP
  BB: { label: "Walk", isHit: false, isAtBat: false, isOut: false },
  IBB: { label: "Intentional Walk", isHit: false, isAtBat: false, isOut: false },
  HBP: { label: "Hit By Pitch", isHit: false, isAtBat: false, isOut: false },
  // Errors
  E: { label: "Reached on Error", isHit: false, isAtBat: true, isOut: false },
  // Interference
  CI: { label: "Catcher Interference", isHit: false, isAtBat: false, isOut: false },
  INT: { label: "Interference", isHit: false, isAtBat: false, isOut: false },
} as const;

export type AtBatResultType = keyof typeof AT_BAT_RESULTS;

export const AT_BAT_RESULT_TYPES = Object.keys(AT_BAT_RESULTS) as AtBatResultType[];

export const SUBSTITUTION_TYPES = {
  pinch_hitter: "Pinch Hitter",
  pinch_runner: "Pinch Runner",
  defensive_replacement: "Defensive Replacement",
  pitching_change: "Pitching Change",
  double_switch: "Double Switch",
  position_change: "Position Change",
} as const;

export type SubstitutionType = keyof typeof SUBSTITUTION_TYPES;

export const PLAY_TYPES = {
  advance: "Advance",
  out: "Out",
  error: "Error",
  stolen_base: "Stolen Base",
  caught_stealing: "Caught Stealing",
  wild_pitch: "Wild Pitch",
  passed_ball: "Passed Ball",
  balk: "Balk",
  pickoff: "Pickoff",
  interference: "Interference",
} as const;

export type PlayType = keyof typeof PLAY_TYPES;

export const PLAY_LEVELS = {
  youth: "Youth/Little League",
  high_school: "High School",
  college: "College",
  adult: "Adult League",
  professional: "Professional",
} as const;

export type PlayLevel = keyof typeof PLAY_LEVELS;

// ==============================================
// BASIC TYPES
// ==============================================

export type HalfInning = "top" | "bottom";
export type TeamSide = "home" | "away";
export type Base = "0" | "1" | "2" | "3";
export type BaseDestination = "1" | "2" | "3" | "H" | "OUT";
export type BattingHand = "R" | "L" | "S";
export type ThrowingHand = "R" | "L";
export type GameStatus = "in_progress" | "completed" | "suspended" | "cancelled";

// ==============================================
// DATABASE ENTITY TYPES
// ==============================================

export type SavedTeam = {
  id: string;
  user_id: string;
  name: string;
  abbreviation: string | null;
  level: PlayLevel | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type SavedTeamInsert = Omit<SavedTeam, "id" | "created_at" | "updated_at">;
export type SavedTeamUpdate = Partial<Omit<SavedTeam, "id" | "user_id" | "created_at">>;

export type SavedPlayer = {
  id: string;
  user_id: string;
  team_id: string;
  jersey_number: string | null;
  first_name: string;
  last_name: string;
  bats: BattingHand | null;
  throws: ThrowingHand | null;
  primary_position: Position | null;
  secondary_positions: Position[] | null;
  created_at: string;
  updated_at: string;
};

export type SavedPlayerInsert = Omit<SavedPlayer, "id" | "created_at" | "updated_at">;
export type SavedPlayerUpdate = Partial<Omit<SavedPlayer, "id" | "user_id" | "team_id" | "created_at">>;

export type Game = {
  id: string;
  user_id: string;
  game_date: string;
  game_time: string | null;
  location: string | null;
  weather: string | null;
  notes: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string;
  away_team_name: string;
  status: GameStatus;
  current_inning: number;
  current_half: HalfInning;
  home_final_score: number;
  away_final_score: number;
  innings_scheduled: number;
  use_dh: boolean;
  created_at: string;
  updated_at: string;
};

export type GameInsert = Omit<Game, "id" | "created_at" | "updated_at">;
export type GameUpdate = Partial<Omit<Game, "id" | "user_id" | "created_at">>;

export type GameLineupEntry = {
  id: string;
  user_id: string;
  game_id: string;
  team_side: TeamSide;
  player_id: string | null;
  player_name: string;
  jersey_number: string | null;
  bats: BattingHand | null;
  throws: ThrowingHand | null;
  batting_order: number | null;
  defensive_position: Position | null;
  entry_inning: number;
  entry_half: HalfInning;
  entry_batter: number;
  is_active: boolean;
  created_at: string;
};

export type GameLineupEntryInsert = Omit<GameLineupEntry, "id" | "created_at">;
export type GameLineupEntryUpdate = Partial<Omit<GameLineupEntry, "id" | "user_id" | "game_id" | "created_at">>;

export type Substitution = {
  id: string;
  user_id: string;
  game_id: string;
  team_side: TeamSide;
  incoming_lineup_id: string;
  outgoing_lineup_id: string | null;
  inning: number;
  half: HalfInning;
  batter_number: number | null;
  substitution_type: SubstitutionType;
  new_batting_order: number | null;
  new_position: Position | null;
  notes: string | null;
  created_at: string;
};

export type SubstitutionInsert = Omit<Substitution, "id" | "created_at">;

export type AtBat = {
  id: string;
  user_id: string;
  game_id: string;
  inning: number;
  half: HalfInning;
  batter_number: number;
  batter_lineup_id: string;
  pitcher_lineup_id: string;
  result_type: AtBatResultType;
  result_detail: string | null;
  balls: number;
  strikes: number;
  pitch_count: number;
  pitch_sequence: string | null;
  hit_location_x: number | null;
  hit_location_y: number | null;
  hit_zone_id: string | null;
  final_pitch_zone_id: string | null;
  rbis: number;
  is_quality_ab: boolean;
  notes: string | null;
  created_at: string;
};

export type AtBatInsert = Omit<AtBat, "id" | "created_at">;
export type AtBatUpdate = Partial<Omit<AtBat, "id" | "user_id" | "game_id" | "created_at">>;

export type Play = {
  id: string;
  user_id: string;
  game_id: string;
  at_bat_id: string;
  play_sequence: number;
  runner_lineup_id: string | null;
  play_type: PlayType;
  from_base: Base | null;
  to_base: BaseDestination | null;
  fielding_sequence: string | null;
  putout_positions: Position[] | null;
  assist_positions: Position[] | null;
  error_position: Position | null;
  error_type: string | null;
  is_out: boolean;
  run_scored: boolean;
  is_earned_run: boolean;
  notes: string | null;
  created_at: string;
};

export type PlayInsert = Omit<Play, "id" | "created_at">;
export type PlayUpdate = Partial<Omit<Play, "id" | "user_id" | "game_id" | "at_bat_id" | "created_at">>;

export type InningSummary = {
  id: string;
  user_id: string;
  game_id: string;
  inning: number;
  half: HalfInning;
  runs: number;
  hits: number;
  errors: number;
  left_on_base: number;
  pitcher_changes: number;
};

export type InningSummaryInsert = Omit<InningSummary, "id">;

// ==============================================
// COMPUTED/DERIVED TYPES (for UI state)
// ==============================================

export type BaseState = {
  first: GameLineupEntry | null;
  second: GameLineupEntry | null;
  third: GameLineupEntry | null;
};

export type GameState = {
  game: Game;
  homeLineup: GameLineupEntry[];
  awayLineup: GameLineupEntry[];
  atBats: AtBat[];
  plays: Play[];
  substitutions: Substitution[];
  inningSummaries: InningSummary[];
  currentBaseState: BaseState;
  currentOuts: number;
  currentBatterIndex: number;
};

// ==============================================
// BOX SCORE STATS
// ==============================================

export type BatterBoxScore = {
  lineupId: string;
  playerName: string;
  jerseyNumber: string | null;
  battingOrder: number;
  position: Position | null;
  ab: number;
  r: number;
  h: number;
  rbi: number;
  bb: number;
  k: number;
  avg: number;
};

export type PitcherBoxScore = {
  lineupId: string;
  playerName: string;
  ip: number;
  ipDisplay: string;
  h: number;
  r: number;
  er: number;
  bb: number;
  k: number;
  pc: number;
  era: number;
};

export type AdvancedBatterStats = {
  obp: number;
  slg: number;
  ops: number;
  pa: number;
  tb: number;
  hbp: number;
  sf: number;
  gidp: number;
};

export type AdvancedPitcherStats = {
  whip: number;
  kbb: number;
  kPer9: number;
  bbPer9: number;
  hPer9: number;
};

export type LineScore = {
  home: number[];
  away: number[];
  homeTotal: { r: number; h: number; e: number };
  awayTotal: { r: number; h: number; e: number };
};

// ==============================================
// UTILITY FUNCTIONS
// ==============================================

export function isPosition(value: string | null | undefined): value is Position {
  if (!value) return false;
  return value in POSITIONS;
}

export function isAtBatResultType(value: string | null | undefined): value is AtBatResultType {
  if (!value) return false;
  return value in AT_BAT_RESULTS;
}

export function isSubstitutionType(value: string | null | undefined): value is SubstitutionType {
  if (!value) return false;
  return value in SUBSTITUTION_TYPES;
}

export function isPlayType(value: string | null | undefined): value is PlayType {
  if (!value) return false;
  return value in PLAY_TYPES;
}

export function isPlayLevel(value: string | null | undefined): value is PlayLevel {
  if (!value) return false;
  return value in PLAY_LEVELS;
}

export function getPlayerDisplayName(player: { first_name: string; last_name: string } | { player_name: string }): string {
  if ("player_name" in player) {
    return player.player_name;
  }
  return `${player.first_name} ${player.last_name}`;
}

export function getPlayerShortName(player: { first_name: string; last_name: string } | { player_name: string }): string {
  if ("player_name" in player) {
    const parts = player.player_name.split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
    }
    return player.player_name;
  }
  return `${player.first_name[0]}. ${player.last_name}`;
}

export function formatInningsPitched(outs: number): string {
  const fullInnings = Math.floor(outs / 3);
  const partialOuts = outs % 3;
  return partialOuts === 0 ? `${fullInnings}.0` : `${fullInnings}.${partialOuts}`;
}

export function parseInningsPitched(display: string): number {
  const parts = display.split(".");
  const fullInnings = parseInt(parts[0], 10) || 0;
  const partialOuts = parseInt(parts[1], 10) || 0;
  return fullInnings + partialOuts / 3;
}

export function getHalfInningLabel(half: HalfInning, inning: number): string {
  const halfLabel = half === "top" ? "Top" : "Bot";
  return `${halfLabel} ${inning}`;
}

export function getTeamSideLabel(side: TeamSide): string {
  return side === "home" ? "Home" : "Away";
}

export function getBattingTeam(half: HalfInning): TeamSide {
  return half === "top" ? "away" : "home";
}

export function getFieldingTeam(half: HalfInning): TeamSide {
  return half === "top" ? "home" : "away";
}
