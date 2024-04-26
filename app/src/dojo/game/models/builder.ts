import { ComponentValue } from "@dojoengine/recs";

export class Builder {
  public gameId: number;
  public playerId: string;
  public index: number;
  public score: number;
  public tileId: number;
  public characters: number;

  constructor(builder: ComponentValue) {
    this.gameId = builder.game_id;
    this.playerId = builder.player_id;
    this.index = builder.index;
    this.score = builder.score;
    this.tileId = builder.tile_id;
    this.characters = builder.characters;
  }
}
