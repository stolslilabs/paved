import { ComponentValue } from "@dojoengine/recs";

export class Builder {
  public game_id: number;
  public player_id: string;
  public tile_id: number;
  public characters: number;

  constructor(builder: ComponentValue) {
    this.game_id = builder.game_id;
    this.player_id = `0x${builder.player_id.toString(16).replace("0x", "")}`;
    this.tile_id = builder.tile_id;
    this.characters = builder.characters;
  }
}
