import { ComponentValue } from "@dojoengine/recs";
import { shortString } from "starknet";

export class Player {
  public id: BigInt;
  public name: string;
  public order: number;
  public bank: number;
  public score: number;
  public paved: number;
  public master: string;

  constructor(player: ComponentValue) {
    this.id = player.id;
    this.name = shortString.decodeShortString(`0x${player.name.toString(16)}`);
    this.order = player.order;
    this.bank = player.bank;
    this.score = player.score;
    this.paved = player.paved;
    this.master = `0x${player.master.toString(16)}`;
  }
}
