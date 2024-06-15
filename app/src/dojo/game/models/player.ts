import { ComponentValue } from "@dojoengine/recs";
import { shortString } from "starknet";

export class Player {
  public id: BigInt;
  public name: string;
  public score: number;
  public paved: number;
  public master: string;

  constructor(player: ComponentValue) {
    this.id = player.id;
    this.name = shortString.decodeShortString(player.name);
    this.score = player.score;
    this.paved = player.paved;
    this.master = `0x${player.master.toString(16)}`;
  }
}
