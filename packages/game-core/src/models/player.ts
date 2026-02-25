export interface PlayerData {
  id: number | bigint | string;
  name: number | bigint | string;
  score: number;
  paved: number;
  master: number | bigint | string;
}

function decodeShortString(felt: number | bigint | string): string {
  const hex = BigInt(felt).toString(16);
  let str = "";
  for (let i = 0; i < hex.length; i += 2) {
    const charCode = parseInt(hex.substring(i, i + 2), 16);
    if (charCode === 0) break;
    str += String.fromCharCode(charCode);
  }
  return str;
}

export class Player {
  public id: string;
  public name: string;
  public score: number;
  public paved: number;
  public master: string;

  constructor(player: PlayerData) {
    this.id = `0x${BigInt(player.id).toString(16)}`;
    this.name = decodeShortString(player.name);
    this.score = player.score;
    this.paved = player.paved;
    this.master = `0x${BigInt(player.master).toString(16)}`;
  }

  public getShortName(): string {
    return this.name.length > 11 ? this.name.slice(0, 8) + "\u2026" : this.name;
  }
}
