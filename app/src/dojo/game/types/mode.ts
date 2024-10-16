// Source: contracts/src/types/role.cairo

import { CategoryType } from "./category";

export enum ModeType {
  None = "none",
  Daily = "daily",
  Weekly = "weekly",
  Tutorial = "tutorial",
  Duel = "duel",
}

export class Mode {
  value: ModeType;

  constructor(mode: ModeType) {
    this.value = mode;
  }

  public into(): number {
    return Object.values(ModeType).indexOf(this.value);
  }

  public static from(index: number): Mode {
    const mode = Object.values(ModeType)[index];
    return new Mode(mode);
  }

  public duration(): number {
    switch (this.value) {
      case ModeType.Daily:
        return 86400;
      case ModeType.Weekly:
        return 604800;
      case ModeType.Tutorial:
        return 1;
      case ModeType.None:
        return 0;
    }
  }

  public offset(): number {
    switch (this.value) {
      case ModeType.Daily:
        return 19855;
      case ModeType.Weekly:
        return 2835;
      case ModeType.Tutorial:
        return 0;
      case ModeType.None:
        return 0;
    }
  }

  public price(): bigint {
    switch (this.value) {
      case ModeType.Daily:
        return BigInt(0);
      case ModeType.Weekly:
        return BigInt("1_000_000_000_000_000_000");
      case ModeType.Tutorial:
        return BigInt(0);
      case ModeType.None:
        return BigInt(0);
    }
  }

  public count(): number {
    switch (this.value) {
      case ModeType.Daily:
        return 38;
      case ModeType.Weekly:
        return 72;
      case ModeType.Tutorial:
        return 9;
      case ModeType.None:
        return 0;
    }
  }
}
