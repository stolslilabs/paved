import { ComponentValue } from "@dojoengine/recs";
import { shortString } from "starknet";

export class Player {
  public id: string;
  public name: string;
  public score: number;
  public paved: number;
  public master: string;

  constructor(player: ComponentValue) {
    this.id = `0x${player.id.toString(16).replace("0x", "")}`;
    this.name = shortString.decodeShortString(player.name);
    this.score = player.score;
    this.paved = player.paved;
    this.master = `0x${player.master.toString(16).replace("0x", "")}`;
  }

  public getShortName(): string {
    return this.name.length > 11 ? this.name.slice(0, 8) + "…" : this.name;
  }
}
