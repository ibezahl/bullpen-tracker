/**
 * Scorebook database operations
 * CRUD helpers for all scorebook tables
 */

import { supabase } from "@/lib/supabaseClient";
import { withRetry, getErrorMessage } from "@/lib/api";
import type {
  SavedTeam,
  SavedTeamInsert,
  SavedTeamUpdate,
  SavedPlayer,
  SavedPlayerInsert,
  SavedPlayerUpdate,
  Game,
  GameInsert,
  GameUpdate,
  GameLineupEntry,
  GameLineupEntryInsert,
  GameLineupEntryUpdate,
  Substitution,
  SubstitutionInsert,
  AtBat,
  AtBatInsert,
  AtBatUpdate,
  Play,
  PlayInsert,
  PlayUpdate,
  InningSummary,
  InningSummaryInsert,
  TeamSide,
} from "./types";

// ==============================================
// TEAMS
// ==============================================

export async function fetchTeams(userId: string): Promise<SavedTeam[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_teams")
      .select("*")
      .eq("user_id", userId)
      .order("name", { ascending: true });

    if (error) throw error;
    return data ?? [];
  });
}

export async function fetchTeam(teamId: string): Promise<SavedTeam | null> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_teams")
      .select("*")
      .eq("id", teamId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }
    return data;
  });
}

export async function createTeam(team: SavedTeamInsert): Promise<SavedTeam> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_teams")
      .insert(team)
      .select()
      .single();

    if (error) throw error;
    return data;
  });
}

export async function updateTeam(teamId: string, updates: SavedTeamUpdate): Promise<SavedTeam> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_teams")
      .update(updates)
      .eq("id", teamId)
      .select()
      .single();

    if (error) throw error;
    return data;
  });
}

export async function deleteTeam(teamId: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from("sb_teams").delete().eq("id", teamId);

    if (error) throw error;
  });
}

// ==============================================
// TEAM PLAYERS
// ==============================================

export async function fetchTeamPlayers(teamId: string): Promise<SavedPlayer[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_team_players")
      .select("*")
      .eq("team_id", teamId)
      .order("last_name", { ascending: true });

    if (error) throw error;
    return data ?? [];
  });
}

export async function createPlayer(player: SavedPlayerInsert): Promise<SavedPlayer> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_team_players")
      .insert(player)
      .select()
      .single();

    if (error) throw error;
    return data;
  });
}

export async function updatePlayer(playerId: string, updates: SavedPlayerUpdate): Promise<SavedPlayer> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_team_players")
      .update(updates)
      .eq("id", playerId)
      .select()
      .single();

    if (error) throw error;
    return data;
  });
}

export async function deletePlayer(playerId: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from("sb_team_players").delete().eq("id", playerId);

    if (error) throw error;
  });
}

// ==============================================
// GAMES
// ==============================================

export async function fetchGames(userId: string): Promise<Game[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_games")
      .select("*")
      .eq("user_id", userId)
      .order("game_date", { ascending: false });

    if (error) throw error;
    return data ?? [];
  });
}

export async function fetchGame(gameId: string): Promise<Game | null> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }
    return data;
  });
}

export async function createGame(game: GameInsert): Promise<Game> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_games")
      .insert(game)
      .select()
      .single();

    if (error) throw error;
    return data;
  });
}

export async function updateGame(gameId: string, updates: GameUpdate): Promise<Game> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_games")
      .update(updates)
      .eq("id", gameId)
      .select()
      .single();

    if (error) throw error;
    return data;
  });
}

export async function deleteGame(gameId: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from("sb_games").delete().eq("id", gameId);

    if (error) throw error;
  });
}

// ==============================================
// GAME LINEUPS
// ==============================================

export async function fetchGameLineups(gameId: string): Promise<GameLineupEntry[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_game_lineups")
      .select("*")
      .eq("game_id", gameId)
      .order("batting_order", { ascending: true });

    if (error) throw error;
    return data ?? [];
  });
}

export async function fetchGameLineupsBySide(
  gameId: string,
  teamSide: TeamSide
): Promise<GameLineupEntry[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_game_lineups")
      .select("*")
      .eq("game_id", gameId)
      .eq("team_side", teamSide)
      .order("batting_order", { ascending: true });

    if (error) throw error;
    return data ?? [];
  });
}

export async function createLineupEntry(entry: GameLineupEntryInsert): Promise<GameLineupEntry> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_game_lineups")
      .insert(entry)
      .select()
      .single();

    if (error) throw error;
    return data;
  });
}

export async function createLineupEntries(entries: GameLineupEntryInsert[]): Promise<GameLineupEntry[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_game_lineups")
      .insert(entries)
      .select();

    if (error) throw error;
    return data ?? [];
  });
}

export async function updateLineupEntry(
  entryId: string,
  updates: GameLineupEntryUpdate
): Promise<GameLineupEntry> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_game_lineups")
      .update(updates)
      .eq("id", entryId)
      .select()
      .single();

    if (error) throw error;
    return data;
  });
}

export async function deleteLineupEntry(entryId: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from("sb_game_lineups").delete().eq("id", entryId);

    if (error) throw error;
  });
}

// ==============================================
// SUBSTITUTIONS
// ==============================================

export async function fetchSubstitutions(gameId: string): Promise<Substitution[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_substitutions")
      .select("*")
      .eq("game_id", gameId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return data ?? [];
  });
}

export async function createSubstitution(sub: SubstitutionInsert): Promise<Substitution> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_substitutions")
      .insert(sub)
      .select()
      .single();

    if (error) throw error;
    return data;
  });
}

export async function deleteSubstitution(subId: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from("sb_substitutions").delete().eq("id", subId);

    if (error) throw error;
  });
}

// ==============================================
// AT-BATS
// ==============================================

export async function fetchAtBats(gameId: string): Promise<AtBat[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_at_bats")
      .select("*")
      .eq("game_id", gameId)
      .order("inning", { ascending: true })
      .order("half", { ascending: true })
      .order("batter_number", { ascending: true });

    if (error) throw error;
    return data ?? [];
  });
}

export async function createAtBat(atBat: AtBatInsert): Promise<AtBat> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_at_bats")
      .insert(atBat)
      .select()
      .single();

    if (error) throw error;
    return data;
  });
}

export async function updateAtBat(atBatId: string, updates: AtBatUpdate): Promise<AtBat> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_at_bats")
      .update(updates)
      .eq("id", atBatId)
      .select()
      .single();

    if (error) throw error;
    return data;
  });
}

export async function deleteAtBat(atBatId: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from("sb_at_bats").delete().eq("id", atBatId);

    if (error) throw error;
  });
}

// ==============================================
// PLAYS
// ==============================================

export async function fetchPlays(gameId: string): Promise<Play[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_plays")
      .select("*")
      .eq("game_id", gameId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return data ?? [];
  });
}

export async function fetchPlaysByAtBat(atBatId: string): Promise<Play[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_plays")
      .select("*")
      .eq("at_bat_id", atBatId)
      .order("play_sequence", { ascending: true });

    if (error) throw error;
    return data ?? [];
  });
}

export async function createPlay(play: PlayInsert): Promise<Play> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_plays")
      .insert(play)
      .select()
      .single();

    if (error) throw error;
    return data;
  });
}

export async function createPlays(plays: PlayInsert[]): Promise<Play[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_plays")
      .insert(plays)
      .select();

    if (error) throw error;
    return data ?? [];
  });
}

export async function updatePlay(playId: string, updates: PlayUpdate): Promise<Play> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_plays")
      .update(updates)
      .eq("id", playId)
      .select()
      .single();

    if (error) throw error;
    return data;
  });
}

export async function deletePlay(playId: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from("sb_plays").delete().eq("id", playId);

    if (error) throw error;
  });
}

// ==============================================
// INNING SUMMARIES
// ==============================================

export async function fetchInningSummaries(gameId: string): Promise<InningSummary[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_inning_summaries")
      .select("*")
      .eq("game_id", gameId)
      .order("inning", { ascending: true })
      .order("half", { ascending: true });

    if (error) throw error;
    return data ?? [];
  });
}

export async function upsertInningSummary(summary: InningSummaryInsert): Promise<InningSummary> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("sb_inning_summaries")
      .upsert(summary, { onConflict: "game_id,inning,half" })
      .select()
      .single();

    if (error) throw error;
    return data;
  });
}

// ==============================================
// FULL GAME STATE LOADER
// ==============================================

export type FullGameData = {
  game: Game;
  homeLineup: GameLineupEntry[];
  awayLineup: GameLineupEntry[];
  atBats: AtBat[];
  plays: Play[];
  substitutions: Substitution[];
  inningSummaries: InningSummary[];
};

export async function fetchFullGameData(gameId: string): Promise<FullGameData | null> {
  const game = await fetchGame(gameId);
  if (!game) return null;

  const [lineups, atBats, plays, substitutions, inningSummaries] = await Promise.all([
    fetchGameLineups(gameId),
    fetchAtBats(gameId),
    fetchPlays(gameId),
    fetchSubstitutions(gameId),
    fetchInningSummaries(gameId),
  ]);

  const homeLineup = lineups.filter((l) => l.team_side === "home");
  const awayLineup = lineups.filter((l) => l.team_side === "away");

  return {
    game,
    homeLineup,
    awayLineup,
    atBats,
    plays,
    substitutions,
    inningSummaries,
  };
}

// Re-export utility
export { getErrorMessage };
