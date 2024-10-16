import { ComponentValue } from "@dojoengine/recs";

export class Builder {
  public game_id: number;
  public player_id: string;
  public index: number;
  public characters: number;
  public discarded: number;
  public built: number;
  public score: number;
  public tile_id: number;

  constructor(builder: ComponentValue) {
    this.game_id = builder.game_id;
    this.player_id = `0x${builder.player_id.toString(16).replace("0x", "")}`;
    this.index = builder.index;
    this.characters = builder.characters;
    this.discarded = builder.discarded;
    this.built = builder.built;
    this.score = builder.score;
    this.tile_id = builder.tile_id;
  }
}
