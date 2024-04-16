import { shortString } from "starknet";
import { Mode, ModeType } from "../types/mode";
import { ComponentValue } from "@dojoengine/recs";

export class Game {
  public id: number;
  public name: string;
  public over: boolean;
  public players: string;
  public player_count: number;
  public tiles: string;
  public tile_count: number;
  public start_time: number;
  public duration: number;
  public price: string;
  public prize: string;
  public score: number;
  public mode: Mode;
  public deck: number;
  public seed: string;

  constructor(game: ComponentValue) {
    this.id = game.id;
    this.name = shortString.decodeShortString(`0x${game.name.toString(16)}`);
    this.over = game.over;
    this.players = game.players;
    this.player_count = game.player_count;
    this.tiles = game.tiles;
    this.tile_count = game.tile_count;
    this.start_time = game.start_time;
    this.duration = game.duration;
    this.price = game.price;
    this.prize = game.prize;
    this.score = game.score;
    this.mode = Mode.from(game.mode);
    this.deck = game.deck;
    this.seed = game.seed;
  }

  public isOver(): boolean {
    const endtime = this.start_time + this.duration;
    const now = Math.floor(Date.now() / 1000);
    return (
      this.start_time !== 0 &&
      (this.over || (this.duration !== 0 && now > endtime))
    );
  }

  public isSoloMode(): boolean {
    return this.isSingleMode() || this.isRankedMode();
  }

  public isSingleMode(): boolean {
    return this.mode.value === ModeType.Single;
  }

  public isRankedMode(): boolean {
    return this.mode.value === ModeType.Ranked;
  }

  public isMultiMode(): boolean {
    return this.mode.value === ModeType.Multi;
  }

  public tilesLeft(): number {
    return this.isSoloMode() ? 72 - this.tile_count : 0;
  }
}
