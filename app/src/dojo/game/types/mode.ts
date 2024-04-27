// Source: contracts/src/types/mode.cairo

export enum ModeType {
  None = "None",
  Ranked = "Ranked",
  Single = "Single",
  Multi = "Multi",
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
}
