// Source: contracts/src/types/order.cairo

import { AllianceType } from "./alliance";

export enum OrderType {
  None = "None",
  Anger = "Anger",
  Titans = "Titans",
  Vitriol = "Vitriol",
  Brillance = "Brillance",
  Detection = "Detection",
  Enlightenment = "Enlightenment",
  Fury = "Fury",
  Giants = "Giants",
  Perfection = "Perfection",
  Power = "Power",
  Protection = "Protection",
  Rage = "Rage",
  Reflection = "Reflection",
  Skill = "Skill",
  Fox = "Fox",
  Twins = "Twins",
}

export class Order {
  value: OrderType;

  constructor(value: OrderType) {
    this.value = value;
  }

  public into(): number {
    return Object.values(OrderType).indexOf(this.value);
  }

  public from(index: number): Order {
    const order = Object.values(OrderType)[index];
    return new Order(order);
  }

  public getAlliance(): AllianceType {
    switch (this.value) {
      case OrderType.Anger:
        return AllianceType.Darkness;
      case OrderType.Titans:
        return AllianceType.Darkness;
      case OrderType.Vitriol:
        return AllianceType.Darkness;
      case OrderType.Brillance:
        return AllianceType.Light;
      case OrderType.Detection:
        return AllianceType.Darkness;
      case OrderType.Enlightenment:
        return AllianceType.Light;
      case OrderType.Fury:
        return AllianceType.Darkness;
      case OrderType.Giants:
        return AllianceType.Light;
      case OrderType.Perfection:
        return AllianceType.Light;
      case OrderType.Power:
        return AllianceType.Darkness;
      case OrderType.Protection:
        return AllianceType.Light;
      case OrderType.Rage:
        return AllianceType.Darkness;
      case OrderType.Reflection:
        return AllianceType.Light;
      case OrderType.Skill:
        return AllianceType.Light;
      case OrderType.Fox:
        return AllianceType.Darkness;
      case OrderType.Twins:
        return AllianceType.Light;
      default:
        return AllianceType.None;
    }
  }
}
