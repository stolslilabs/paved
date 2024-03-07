// Source: contracts/src/types/area.cairo

import { OrientationType } from "./orientation";

export enum AreaType {
  None = "None",
  A = "A",
  B = "B",
  C = "C",
  D = "D",
  E = "E",
  F = "F",
  G = "G",
  H = "H",
  I = "I",
}

export class Area {
  value: AreaType;

  constructor(area: AreaType) {
    this.value = area;
  }

  public into(): number {
    return Object.values(AreaType).indexOf(this.value);
  }

  public from(index: number): Area {
    const area = Object.values(AreaType)[index];
    return new Area(area);
  }

  public rotate(orientation: OrientationType): Area {
    switch (orientation) {
      case OrientationType.North:
        return new Area(this.value);
      case OrientationType.East:
        switch (this.value) {
          case AreaType.A:
            return new Area(AreaType.A);
          case AreaType.B:
            return new Area(AreaType.D);
          case AreaType.C:
            return new Area(AreaType.E);
          case AreaType.D:
            return new Area(AreaType.F);
          case AreaType.E:
            return new Area(AreaType.G);
          case AreaType.F:
            return new Area(AreaType.H);
          case AreaType.G:
            return new Area(AreaType.I);
          case AreaType.H:
            return new Area(AreaType.B);
          case AreaType.I:
            return new Area(AreaType.C);
          default:
            return new Area(AreaType.None);
        }
      case OrientationType.South:
        switch (this.value) {
          case AreaType.A:
            return new Area(AreaType.A);
          case AreaType.B:
            return new Area(AreaType.F);
          case AreaType.C:
            return new Area(AreaType.G);
          case AreaType.D:
            return new Area(AreaType.H);
          case AreaType.E:
            return new Area(AreaType.I);
          case AreaType.F:
            return new Area(AreaType.B);
          case AreaType.G:
            return new Area(AreaType.C);
          case AreaType.H:
            return new Area(AreaType.D);
          case AreaType.I:
            return new Area(AreaType.E);
          default:
            return new Area(AreaType.None);
        }
      case OrientationType.West:
        switch (this.value) {
          case AreaType.A:
            return new Area(AreaType.A);
          case AreaType.B:
            return new Area(AreaType.H);
          case AreaType.C:
            return new Area(AreaType.I);
          case AreaType.D:
            return new Area(AreaType.B);
          case AreaType.E:
            return new Area(AreaType.C);
          case AreaType.F:
            return new Area(AreaType.D);
          case AreaType.G:
            return new Area(AreaType.E);
          case AreaType.H:
            return new Area(AreaType.F);
          case AreaType.I:
            return new Area(AreaType.G);
          default:
            return new Area(AreaType.None);
        }
      default:
        return new Area(AreaType.None);
    }
  }

  public antirotate(orientation: OrientationType): Area {
    switch (orientation) {
      case OrientationType.North:
        return this.rotate(OrientationType.North);
      case OrientationType.East:
        return this.rotate(OrientationType.West);
      case OrientationType.South:
        return this.rotate(OrientationType.South);
      case OrientationType.West:
        return this.rotate(OrientationType.East);
      default:
        return this.rotate(OrientationType.None);
    }
  }
}
