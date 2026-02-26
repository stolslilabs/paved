import {
  Game, GameData,
  Player, PlayerData,
  Builder, BuilderData,
  Character, CharacterData,
  Tile, TileData,
  Tournament, TournamentData,
} from "@paved/game-core";

/** Convert raw Torii entity to Game instance */
export function toGame(raw: Record<string, any>): Game {
  const data: GameData = {
    id: Number(raw.id ?? 0),
    over: Boolean(raw.over),
    built: Number(raw.built ?? 0),
    discarded: Number(raw.discarded ?? 0),
    tiles: raw.tiles ?? 0n,
    tile_count: Number(raw.tile_count ?? 0),
    start_time: Number(raw.start_time ?? 0),
    end_time: Number(raw.end_time ?? 0),
    score: Number(raw.score ?? 0),
    seed: raw.seed ?? 0n,
    mode: Number(raw.mode ?? 0),
    tournament_id: raw.tournament_id ?? 0n,
    entry_multiplier_fp: Number(raw.entry_multiplier_fp ?? 0),
    entry_supply_snapshot: raw.entry_supply_snapshot ?? 0n,
    entry_target_snapshot: raw.entry_target_snapshot ?? 0n,
  };
  return new Game(data);
}

/** Convert raw Torii entity to Player instance */
export function toPlayer(raw: Record<string, any>): Player {
  const data: PlayerData = {
    id: raw.id ?? 0,
    name: raw.name ?? 0,
    score: Number(raw.score ?? 0),
    paved: Number(raw.paved ?? 0),
    master: raw.master ?? 0,
  };
  return new Player(data);
}

/** Convert raw Torii entity to Builder instance */
export function toBuilder(raw: Record<string, any>): Builder {
  const data: BuilderData = {
    game_id: Number(raw.game_id ?? 0),
    player_id: raw.player_id ?? 0,
    tile_id: Number(raw.tile_id ?? 0),
    characters: Number(raw.characters ?? 0),
  };
  return new Builder(data);
}

/** Convert raw Torii entity to Character instance */
export function toCharacter(raw: Record<string, any>): Character {
  const data: CharacterData = {
    game_id: Number(raw.game_id ?? 0),
    player_id: raw.player_id ?? 0,
    index: Number(raw.index ?? 0),
    tile_id: Number(raw.tile_id ?? 0),
    spot: Number(raw.spot ?? 0),
    weight: Number(raw.weight ?? 0),
    power: Number(raw.power ?? 0),
  };
  return new Character(data);
}

/** Convert raw Torii entity to Tile instance */
export function toTile(raw: Record<string, any>): Tile {
  const data: TileData = {
    game_id: Number(raw.game_id ?? 0),
    id: Number(raw.id ?? 0),
    player_id: raw.player_id ?? 0,
    plan: Number(raw.plan ?? 0),
    orientation: Number(raw.orientation ?? 0),
    x: Number(raw.x ?? 0),
    y: Number(raw.y ?? 0),
    occupied_spot: Number(raw.occupied_spot ?? 0),
  };
  return new Tile(data);
}

/** Convert raw Torii entity to Tournament instance */
export function toTournament(raw: Record<string, any>): Tournament {
  const data: TournamentData = {
    id: Number(raw.id ?? 0),
    prize: raw.prize ?? 0,
    top1_player_id: raw.top1_player_id ?? 0,
    top1_multiplier_fp: Number(raw.top1_multiplier_fp ?? 1_000_000),
    top2_player_id: raw.top2_player_id ?? 0,
    top2_multiplier_fp: Number(raw.top2_multiplier_fp ?? 1_000_000),
    top3_player_id: raw.top3_player_id ?? 0,
    top3_multiplier_fp: Number(raw.top3_multiplier_fp ?? 1_000_000),
    top1_score: Number(raw.top1_score ?? 0),
    top2_score: Number(raw.top2_score ?? 0),
    top3_score: Number(raw.top3_score ?? 0),
    top1_claimed: Boolean(raw.top1_claimed),
    top2_claimed: Boolean(raw.top2_claimed),
    top3_claimed: Boolean(raw.top3_claimed),
  };
  return new Tournament(data);
}
