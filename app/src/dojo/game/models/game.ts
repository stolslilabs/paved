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
  public prize: string;
  public score: number;
  public mode: Mode;
  public deck: number;

  constructor(game: ComponentValue) {
    this.id = game.id;
    this.name = game.name;
    this.over = game.over;
    this.players = game.players;
    this.player_count = game.player_count;
    this.tiles = game.tiles;
    this.tile_count = game.tile_count;
    this.start_time = game.start_time;
    this.duration = game.duration;
    this.prize = game.prize;
    this.score = game.score;
    this.mode = Mode.from(game.mode);
    this.deck = game.deck;
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
    return this.mode.value === ModeType.Solo;
  }

  public isMultiMode(): boolean {
    return this.mode.value === ModeType.Multi;
  }
}
