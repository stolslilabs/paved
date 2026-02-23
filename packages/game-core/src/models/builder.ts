export interface BuilderData {
  game_id: number;
  player_id: number | bigint | string;
  tile_id: number;
  characters: number;
}

export class Builder {
  public game_id: number;
  public player_id: string;
  public tile_id: number;
  public characters: number;

  constructor(builder: BuilderData) {
    this.game_id = builder.game_id;
    this.player_id = `0x${BigInt(builder.player_id).toString(16)}`;
    this.tile_id = builder.tile_id;
    this.characters = builder.characters;
  }
}
