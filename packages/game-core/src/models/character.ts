export interface CharacterData {
  game_id: number;
  player_id: number | bigint | string;
  index: number;
  tile_id: number;
  spot: number;
  weight: number;
  power: number;
}

export class Character {
  public game_id: number;
  public player_id: string;
  public index: number;
  public tile_id: number;
  public spot: number;
  public weight: number;
  public power: number;

  constructor(data: CharacterData) {
    this.game_id = data.game_id;
    this.player_id = `0x${BigInt(data.player_id).toString(16)}`;
    this.index = data.index;
    this.tile_id = data.tile_id;
    this.spot = data.spot;
    this.weight = data.weight;
    this.power = data.power;
  }
}
