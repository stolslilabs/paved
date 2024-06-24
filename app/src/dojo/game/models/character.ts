import { ComponentValue } from "@dojoengine/recs";

export class Character {
  public game_id: number;
  public player_id: string;
  public index: number;
  public tile_id: number;
  public spot: number;
  public weight: number;
  public power: number;

  constructor(builder: ComponentValue) {
    this.game_id = builder.game_id;
    this.player_id = `0x${builder.player_id.toString(16).replace("0x", "")}`;
    this.index = builder.index;
    this.tile_id = builder.tile_id;
    this.spot = builder.spot;
    this.weight = builder.weight;
    this.power = builder.power;
  }
}
