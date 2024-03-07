// Source: contracts/src/types/alliance.cairo

import { OrderType } from "./order";

export enum AllianceType {
  None = "None",
  Light = "Light",
  Darkness = "Darkness",
}

export class Alliance {
  value: AllianceType;

  constructor(value: AllianceType) {
    this.value = value;
  }

  public into(): number {
    return Object.values(AllianceType).indexOf(this.value);
  }

  public from(index: number): Alliance {
    const alliance = Object.values(AllianceType)[index];
    return new Alliance(alliance);
  }

  public getOrders(): Array<OrderType> {
    switch (this.value) {
      case AllianceType.Light:
        return [
          OrderType.Brillance,
          OrderType.Enlightenment,
          OrderType.Giants,
          OrderType.Perfection,
          OrderType.Protection,
          OrderType.Reflection,
          OrderType.Skill,
          OrderType.Twins,
        ];
      case AllianceType.Darkness:
        return [
          OrderType.Anger,
          OrderType.Titans,
          OrderType.Vitriol,
          OrderType.Detection,
          OrderType.Fury,
          OrderType.Power,
          OrderType.Rage,
          OrderType.Fox,
        ];
      default:
        return [];
    }
  }
}
