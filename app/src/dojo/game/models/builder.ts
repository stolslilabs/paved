import { ComponentValue } from "@dojoengine/recs";

export class Builder {
  public game_id: number;
  public player_id: string;
  public tile_id: number;
  public characters: number;

  constructor(builder: ComponentValue) {
    this.game_id = builder.game_id;
    this.player_id = builder.player_id;
    this.tile_id = builder.tile_id;
    this.characters = builder.characters;
  }
}
