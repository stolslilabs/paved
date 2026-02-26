import type { SchemaType as ISchemaType } from "@dojoengine/sdk";

import { CairoCustomEnum, BigNumberish } from 'starknet';

// Type definition for `paved::models::index::Builder` struct
export interface Builder {
	game_id: BigNumberish;
	player_id: BigNumberish;
	tile_id: BigNumberish;
	characters: BigNumberish;
}

// Type definition for `paved::models::index::Char` struct
export interface Char {
	game_id: BigNumberish;
	player_id: BigNumberish;
	index: BigNumberish;
	tile_id: BigNumberish;
	spot: BigNumberish;
	weight: BigNumberish;
	power: BigNumberish;
}

// Type definition for `paved::models::index::CharPosition` struct
export interface CharPosition {
	game_id: BigNumberish;
	tile_id: BigNumberish;
	spot: BigNumberish;
	player_id: BigNumberish;
	index: BigNumberish;
}

// Type definition for `paved::models::index::Game` struct
export interface Game {
	id: BigNumberish;
	over: boolean;
	discarded: BigNumberish;
	built: BigNumberish;
	tiles: BigNumberish;
	tile_count: BigNumberish;
	start_time: BigNumberish;
	end_time: BigNumberish;
	score: BigNumberish;
	seed: BigNumberish;
	mode: BigNumberish;
	tournament_id: BigNumberish;
	entry_multiplier_fp: BigNumberish;
	entry_supply_snapshot: BigNumberish;
	entry_target_snapshot: BigNumberish;
}

// Type definition for `paved::models::index::Player` struct
export interface Player {
	id: BigNumberish;
	name: BigNumberish;
	master: BigNumberish;
}

// Type definition for `paved::models::index::Tile` struct
export interface Tile {
	game_id: BigNumberish;
	id: BigNumberish;
	player_id: BigNumberish;
	plan: BigNumberish;
	orientation: BigNumberish;
	x: BigNumberish;
	y: BigNumberish;
	occupied_spot: BigNumberish;
}

// Type definition for `paved::models::index::TilePosition` struct
export interface TilePosition {
	game_id: BigNumberish;
	x: BigNumberish;
	y: BigNumberish;
	tile_id: BigNumberish;
}

// Type definition for `paved::models::index::Tournament` struct
export interface Tournament {
	id: BigNumberish;
	prize: BigNumberish;
	top1_player_id: BigNumberish;
	top1_multiplier_fp: BigNumberish;
	top2_player_id: BigNumberish;
	top2_multiplier_fp: BigNumberish;
	top3_player_id: BigNumberish;
	top3_multiplier_fp: BigNumberish;
	top1_score: BigNumberish;
	top2_score: BigNumberish;
	top3_score: BigNumberish;
	top1_claimed: boolean;
	top2_claimed: boolean;
	top3_claimed: boolean;
}

// Type definition for `paved::models::index::EconomyConfig` struct
export interface EconomyConfig {
	id: BigNumberish;
	target_mode: BigNumberish;
	target_fixed: BigNumberish;
	target_a: BigNumberish;
	target_b: BigNumberish;
	target_t0: BigNumberish;
	team_bps: BigNumberish;
	burn_bps: BigNumberish;
	max_multiplier_fp: BigNumberish;
	fp_scale: BigNumberish;
	manual_target_override: boolean;
	target_override: BigNumberish;
}

// Type definition for `paved::models::index::EconomyState` struct
export interface EconomyState {
	id: BigNumberish;
	last_snapshot_time: BigNumberish;
	last_supply: BigNumberish;
	last_target: BigNumberish;
	last_multiplier_fp: BigNumberish;
	total_minted: BigNumberish;
	total_burned: BigNumberish;
	total_team_alloc: BigNumberish;
}

// Type definition for `paved::events::Built` struct
export interface Built {
	game_id: BigNumberish;
	tile_id: BigNumberish;
	x: BigNumberish;
	y: BigNumberish;
	player_id: BigNumberish;
	player_name: BigNumberish;
}

// Type definition for `paved::events::Discarded` struct
export interface Discarded {
	game_id: BigNumberish;
	tile_id: BigNumberish;
	player_id: BigNumberish;
	player_name: BigNumberish;
	points: BigNumberish;
}

// Type definition for `paved::events::GameOver` struct
export interface GameOver {
	game_id: BigNumberish;
	tournament_id: BigNumberish;
	game_mode: BigNumberish;
	game_score: BigNumberish;
	game_start_time: BigNumberish;
	game_end_time: BigNumberish;
	player_id: BigNumberish;
	player_name: BigNumberish;
	player_master: BigNumberish;
}

// Type definition for `paved::events::ScoredCity` struct
export interface ScoredCity {
	game_id: BigNumberish;
	points: BigNumberish;
	size: BigNumberish;
	player_id: BigNumberish;
	player_name: BigNumberish;
	player_master: BigNumberish;
}

// Type definition for `paved::events::ScoredForest` struct
export interface ScoredForest {
	game_id: BigNumberish;
	points: BigNumberish;
	size: BigNumberish;
	cities: BigNumberish;
	roads: BigNumberish;
	player_id: BigNumberish;
	player_name: BigNumberish;
	player_master: BigNumberish;
}

// Type definition for `paved::events::ScoredRoad` struct
export interface ScoredRoad {
	game_id: BigNumberish;
	points: BigNumberish;
	size: BigNumberish;
	player_id: BigNumberish;
	player_name: BigNumberish;
	player_master: BigNumberish;
}

// Type definition for `paved::events::ScoredWonder` struct
export interface ScoredWonder {
	game_id: BigNumberish;
	points: BigNumberish;
	player_id: BigNumberish;
	player_name: BigNumberish;
	player_master: BigNumberish;
}

// Type definition for `paved::mocks::erc20::erc20::ERC20Component::Approval` struct
export interface Approval {
	owner: string;
	spender: string;
	value: BigNumberish;
}

// Type definition for `paved::mocks::erc20::erc20::ERC20Component::Transfer` struct
export interface Transfer {
	from: string;
	to: string;
	value: BigNumberish;
}

// Type definition for `paved::types::orientation::Orientation` enum
export const orientation = [
	'None',
	'North',
	'East',
	'South',
	'West',
] as const;
export type Orientation = { [key in typeof orientation[number]]: string };
export type OrientationEnum = CairoCustomEnum;

// Type definition for `paved::types::role::Role` enum
export const role = [
	'None',
	'Lord',
	'Lady',
	'Adventurer',
	'Paladin',
	'Pilgrim',
] as const;
export type Role = { [key in typeof role[number]]: string };
export type RoleEnum = CairoCustomEnum;

// Type definition for `paved::types::spot::Spot` enum
export const spot = [
	'None',
	'Center',
	'NorthWest',
	'North',
	'NorthEast',
	'East',
	'SouthEast',
	'South',
	'SouthWest',
	'West',
] as const;
export type Spot = { [key in typeof spot[number]]: string };
export type SpotEnum = CairoCustomEnum;

export interface SchemaType extends ISchemaType {
	paved: {
		Builder: Builder,
		Char: Char,
		CharPosition: CharPosition,
		Game: Game,
		Player: Player,
		Tile: Tile,
		TilePosition: TilePosition,
		Tournament: Tournament,
		EconomyConfig: EconomyConfig,
		EconomyState: EconomyState,
		Built: Built,
		Discarded: Discarded,
		GameOver: GameOver,
		ScoredCity: ScoredCity,
		ScoredForest: ScoredForest,
		ScoredRoad: ScoredRoad,
		ScoredWonder: ScoredWonder,
		Approval: Approval,
		Transfer: Transfer,
	},
}
export const schema: SchemaType = {
	paved: {
		Builder: {
			game_id: 0,
			player_id: 0,
			tile_id: 0,
			characters: 0,
		},
		Char: {
			game_id: 0,
			player_id: 0,
			index: 0,
			tile_id: 0,
			spot: 0,
			weight: 0,
			power: 0,
		},
		CharPosition: {
			game_id: 0,
			tile_id: 0,
			spot: 0,
			player_id: 0,
			index: 0,
		},
		Game: {
			id: 0,
			over: false,
			discarded: 0,
			built: 0,
			tiles: 0,
			tile_count: 0,
			start_time: 0,
			end_time: 0,
			score: 0,
			seed: 0,
			mode: 0,
			tournament_id: 0,
			entry_multiplier_fp: 0,
			entry_supply_snapshot: 0,
			entry_target_snapshot: 0,
		},
		Player: {
			id: 0,
			name: 0,
			master: 0,
		},
		Tile: {
			game_id: 0,
			id: 0,
			player_id: 0,
			plan: 0,
			orientation: 0,
			x: 0,
			y: 0,
			occupied_spot: 0,
		},
		TilePosition: {
			game_id: 0,
			x: 0,
			y: 0,
			tile_id: 0,
		},
		Tournament: {
			id: 0,
			prize: 0,
			top1_player_id: 0,
			top1_multiplier_fp: 0,
			top2_player_id: 0,
			top2_multiplier_fp: 0,
			top3_player_id: 0,
			top3_multiplier_fp: 0,
			top1_score: 0,
			top2_score: 0,
			top3_score: 0,
			top1_claimed: false,
			top2_claimed: false,
			top3_claimed: false,
		},
		EconomyConfig: {
			id: 0,
			target_mode: 0,
			target_fixed: 0,
			target_a: 0,
			target_b: 0,
			target_t0: 0,
			team_bps: 0,
			burn_bps: 0,
			max_multiplier_fp: 0,
			fp_scale: 0,
			manual_target_override: false,
			target_override: 0,
		},
		EconomyState: {
			id: 0,
			last_snapshot_time: 0,
			last_supply: 0,
			last_target: 0,
			last_multiplier_fp: 0,
			total_minted: 0,
			total_burned: 0,
			total_team_alloc: 0,
		},
		Built: {
			game_id: 0,
			tile_id: 0,
			x: 0,
			y: 0,
			player_id: 0,
			player_name: 0,
		},
		Discarded: {
			game_id: 0,
			tile_id: 0,
			player_id: 0,
			player_name: 0,
			points: 0,
		},
		GameOver: {
			game_id: 0,
			tournament_id: 0,
			game_mode: 0,
			game_score: 0,
			game_start_time: 0,
			game_end_time: 0,
			player_id: 0,
			player_name: 0,
			player_master: 0,
		},
		ScoredCity: {
			game_id: 0,
			points: 0,
			size: 0,
			player_id: 0,
			player_name: 0,
			player_master: 0,
		},
		ScoredForest: {
			game_id: 0,
			points: 0,
			size: 0,
			cities: 0,
			roads: 0,
			player_id: 0,
			player_name: 0,
			player_master: 0,
		},
		ScoredRoad: {
			game_id: 0,
			points: 0,
			size: 0,
			player_id: 0,
			player_name: 0,
			player_master: 0,
		},
		ScoredWonder: {
			game_id: 0,
			points: 0,
			player_id: 0,
			player_name: 0,
			player_master: 0,
		},
		Approval: {
			owner: "",
			spender: "",
		value: 0,
		},
		Transfer: {
			from: "",
			to: "",
		value: 0,
		},
	},
};
export enum ModelsMapping {
	Builder = 'paved-Builder',
	Char = 'paved-Char',
	CharPosition = 'paved-CharPosition',
	Game = 'paved-Game',
	Player = 'paved-Player',
	Tile = 'paved-Tile',
	TilePosition = 'paved-TilePosition',
	Tournament = 'paved-Tournament',
	EconomyConfig = 'paved-EconomyConfig',
	EconomyState = 'paved-EconomyState',
	Built = 'paved-Built',
	Discarded = 'paved-Discarded',
	GameOver = 'paved-GameOver',
	ScoredCity = 'paved-ScoredCity',
	ScoredForest = 'paved-ScoredForest',
	ScoredRoad = 'paved-ScoredRoad',
	ScoredWonder = 'paved-ScoredWonder',
	Approval = 'paved-Approval',
	Transfer = 'paved-Transfer',
	Orientation = 'paved-Orientation',
	Role = 'paved-Role',
	Spot = 'paved-Spot',
}
