// Source: contracts/src/types/plan.cairo

import { Configuration as CccccccccImpl } from "../layouts/ccccccccc";
import { Configuration as CccccfffcImpl } from "../layouts/cccccfffc";
import { Configuration as CccccfrfcImpl } from "../layouts/cccccfrfc";
import { Configuration as CfffcfffcImpl } from "../layouts/cfffcfffc";
import { Configuration as CfffcfrfcImpl } from "../layouts/cfffcfrfc";
import { Configuration as FfcfffcfcImpl } from "../layouts/ffcfffcfc";
import { Configuration as FfcfffcffImpl } from "../layouts/ffcfffcff";
import { Configuration as FfcfffffcImpl } from "../layouts/ffcfffffc";
import { Configuration as FfffcccffImpl } from "../layouts/ffffcccff";
import { Configuration as FfffffcffImpl } from "../layouts/ffffffcff";
import { Configuration as RfffrfcfrImpl } from "../layouts/rfffrfcfr";
import { Configuration as RfffrfffrImpl } from "../layouts/rfffrfffr";
import { Configuration as RfrfcccfrImpl } from "../layouts/rfrfcccfr";
import { Configuration as RfrfffcffImpl } from "../layouts/rfrfffcff";
import { Configuration as RfrfffcfrImpl } from "../layouts/rfrfffcfr";
import { Configuration as RfrfffffrImpl } from "../layouts/rfrfffffr";
import { Configuration as RfrfrfcffImpl } from "../layouts/rfrfrfcff";
import { Configuration as SfffffffrImpl } from "../layouts/sfffffffr";
import { Configuration as SfrfrfcfrImpl } from "../layouts/sfrfrfcfr";
import { Configuration as SfrfrfffrImpl } from "../layouts/sfrfrfffr";
import { Configuration as SfrfrfrfrImpl } from "../layouts/sfrfrfrfr";
import { Configuration as WccccccccImpl } from "../layouts/wcccccccc";
import { Configuration as WffffffffImpl } from "../layouts/wffffffff";
import { Configuration as WfffffffrImpl } from "../layouts/wfffffffr";
import { Category } from "./category";
import { SpotType } from "./spot";
import { Move } from "./move";
import { AreaType } from "./area";

export enum PlanType {
  None = "None",
  CCCCCCCCC = "CCCCCCCCC",
  CCCCCFFFC = "CCCCCFFFC",
  CCCCCFRFC = "CCCCCFRFC",
  CFFFCFFFC = "CFFFCFFFC",
  CFFFCFRFC = "CFFFCFRFC",
  FFCFFFCFC = "FFCFFFCFC",
  FFCFFFCFF = "FFCFFFCFF",
  FFCFFFFFC = "FFCFFFFFC",
  FFFFCCCFF = "FFFFCCCFF",
  FFFFFFCFF = "FFFFFFCFF",
  RFFFRFCFR = "RFFFRFCFR",
  RFFFRFFFR = "RFFFRFFFR",
  RFRFCCCFR = "RFRFCCCFR",
  RFRFFFCFF = "RFRFFFCFF",
  RFRFFFCFR = "RFRFFFCFR",
  RFRFFFFFR = "RFRFFFFFR",
  RFRFRFCFF = "RFRFRFCFF",
  SFFFFFFFR = "SFFFFFFFR",
  SFRFRFCFR = "SFRFRFCFR",
  SFRFRFFFR = "SFRFRFFFR",
  SFRFRFRFR = "SFRFRFRFR",
  WCCCCCCCC = "WCCCCCCCC",
  WFFFFFFFF = "WFFFFFFFF",
  WFFFFFFFR = "WFFFFFFFR",
}

export class Plan {
  value: PlanType;

  constructor(value: PlanType) {
    this.value = value;
  }

  public into(): number {
    return Object.values(PlanType).indexOf(this.value);
  }

  public static from(index: number): Plan {
    const plan = Object.values(PlanType)[index];
    return new Plan(plan);
  }

  public unpack(): Array<Category> {
    return this.value.split("").map((char) => {
      return Category.fromChar(char);
    });
  }

  public starts(): Array<SpotType> {
    switch (this.value) {
      case PlanType.CCCCCCCCC:
        return CccccccccImpl.starts();
      case PlanType.CCCCCFFFC:
        return CccccfffcImpl.starts();
      case PlanType.CCCCCFRFC:
        return CccccfrfcImpl.starts();
      case PlanType.CFFFCFFFC:
        return CfffcfffcImpl.starts();
      case PlanType.CFFFCFRFC:
        return CfffcfrfcImpl.starts();
      case PlanType.FFCFFFCFC:
        return FfcfffcfcImpl.starts();
      case PlanType.FFCFFFCFF:
        return FfcfffcffImpl.starts();
      case PlanType.FFCFFFFFC:
        return FfcfffffcImpl.starts();
      case PlanType.FFFFCCCFF:
        return FfffcccffImpl.starts();
      case PlanType.FFFFFFCFF:
        return FfffffcffImpl.starts();
      case PlanType.RFFFRFCFR:
        return RfffrfcfrImpl.starts();
      case PlanType.RFFFRFFFR:
        return RfffrfffrImpl.starts();
      case PlanType.RFRFCCCFR:
        return RfrfcccfrImpl.starts();
      case PlanType.RFRFFFCFF:
        return RfrfffcffImpl.starts();
      case PlanType.RFRFFFCFR:
        return RfrfffcfrImpl.starts();
      case PlanType.RFRFFFFFR:
        return RfrfffffrImpl.starts();
      case PlanType.RFRFRFCFF:
        return RfrfrfcffImpl.starts();
      case PlanType.SFFFFFFFR:
        return SfffffffrImpl.starts();
      case PlanType.SFRFRFCFR:
        return SfrfrfcfrImpl.starts();
      case PlanType.SFRFRFFFR:
        return SfrfrfffrImpl.starts();
      case PlanType.SFRFRFRFR:
        return SfrfrfrfrImpl.starts();
      case PlanType.WCCCCCCCC:
        return WccccccccImpl.starts();
      case PlanType.WFFFFFFFF:
        return WffffffffImpl.starts();
      case PlanType.WFFFFFFFR:
        return WfffffffrImpl.starts();
      default:
        return [];
    }
  }

  public wonder(): SpotType {
    switch (this.value) {
      case PlanType.WCCCCCCCC:
      case PlanType.WFFFFFFFF:
      case PlanType.WFFFFFFFR:
        return SpotType.Center;
      default:
        return SpotType.None;
    }
  }

  public moves(from: SpotType): Array<Move> {
    switch (this.value) {
      case PlanType.CCCCCCCCC:
        return CccccccccImpl.moves(from);
      case PlanType.CCCCCFFFC:
        return CccccfffcImpl.moves(from);
      case PlanType.CCCCCFRFC:
        return CccccfrfcImpl.moves(from);
      case PlanType.CFFFCFFFC:
        return CfffcfffcImpl.moves(from);
      case PlanType.CFFFCFRFC:
        return CfffcfrfcImpl.moves(from);
      case PlanType.FFCFFFCFC:
        return FfcfffcfcImpl.moves(from);
      case PlanType.FFCFFFCFF:
        return FfcfffcffImpl.moves(from);
      case PlanType.FFCFFFFFC:
        return FfcfffffcImpl.moves(from);
      case PlanType.FFFFCCCFF:
        return FfffcccffImpl.moves(from);
      case PlanType.FFFFFFCFF:
        return FfffffcffImpl.moves(from);
      case PlanType.RFFFRFCFR:
        return RfffrfcfrImpl.moves(from);
      case PlanType.RFFFRFFFR:
        return RfffrfffrImpl.moves(from);
      case PlanType.RFRFCCCFR:
        return RfrfcccfrImpl.moves(from);
      case PlanType.RFRFFFCFF:
        return RfrfffcffImpl.moves(from);
      case PlanType.RFRFFFCFR:
        return RfrfffcfrImpl.moves(from);
      case PlanType.RFRFFFFFR:
        return RfrfffffrImpl.moves(from);
      case PlanType.RFRFRFCFF:
        return RfrfrfcffImpl.moves(from);
      case PlanType.SFFFFFFFR:
        return SfffffffrImpl.moves(from);
      case PlanType.SFRFRFCFR:
        return SfrfrfcfrImpl.moves(from);
      case PlanType.SFRFRFFFR:
        return SfrfrfffrImpl.moves(from);
      case PlanType.SFRFRFRFR:
        return SfrfrfrfrImpl.moves(from);
      case PlanType.WCCCCCCCC:
        return WccccccccImpl.moves(from);
      case PlanType.WFFFFFFFF:
        return WffffffffImpl.moves(from);
      case PlanType.WFFFFFFFR:
        return WfffffffrImpl.moves(from);
      default:
        return [];
    }
  }

  public area(from: SpotType): AreaType {
    switch (this.value) {
      case PlanType.CCCCCCCCC:
        return CccccccccImpl.area(from);
      case PlanType.CCCCCFFFC:
        return CccccfffcImpl.area(from);
      case PlanType.CCCCCFRFC:
        return CccccfrfcImpl.area(from);
      case PlanType.CFFFCFFFC:
        return CfffcfffcImpl.area(from);
      case PlanType.CFFFCFRFC:
        return CfffcfrfcImpl.area(from);
      case PlanType.FFCFFFCFC:
        return FfcfffcfcImpl.area(from);
      case PlanType.FFCFFFCFF:
        return FfcfffcffImpl.area(from);
      case PlanType.FFCFFFFFC:
        return FfcfffffcImpl.area(from);
      case PlanType.FFFFCCCFF:
        return FfffcccffImpl.area(from);
      case PlanType.FFFFFFCFF:
        return FfffffcffImpl.area(from);
      case PlanType.RFFFRFCFR:
        return RfffrfcfrImpl.area(from);
      case PlanType.RFFFRFFFR:
        return RfffrfffrImpl.area(from);
      case PlanType.RFRFCCCFR:
        return RfrfcccfrImpl.area(from);
      case PlanType.RFRFFFCFF:
        return RfrfffcffImpl.area(from);
      case PlanType.RFRFFFCFR:
        return RfrfffcfrImpl.area(from);
      case PlanType.RFRFFFFFR:
        return RfrfffffrImpl.area(from);
      case PlanType.RFRFRFCFF:
        return RfrfrfcffImpl.area(from);
      case PlanType.SFFFFFFFR:
        return SfffffffrImpl.area(from);
      case PlanType.SFRFRFCFR:
        return SfrfrfcfrImpl.area(from);
      case PlanType.SFRFRFFFR:
        return SfrfrfffrImpl.area(from);
      case PlanType.SFRFRFRFR:
        return SfrfrfrfrImpl.area(from);
      case PlanType.WCCCCCCCC:
        return WccccccccImpl.area(from);
      case PlanType.WFFFFFFFF:
        return WffffffffImpl.area(from);
      case PlanType.WFFFFFFFR:
        return WfffffffrImpl.area(from);
      default:
        return AreaType.None;
    }
  }

  public adjacentRoads(from: SpotType): Array<SpotType> {
    switch (this.value) {
      case PlanType.CCCCCCCCC:
        return CccccccccImpl.adjacentRoads(from);
      case PlanType.CCCCCFFFC:
        return CccccfffcImpl.adjacentRoads(from);
      case PlanType.CCCCCFRFC:
        return CccccfrfcImpl.adjacentRoads(from);
      case PlanType.CFFFCFFFC:
        return CfffcfffcImpl.adjacentRoads(from);
      case PlanType.CFFFCFRFC:
        return CfffcfrfcImpl.adjacentRoads(from);
      case PlanType.FFCFFFCFC:
        return FfcfffcfcImpl.adjacentRoads(from);
      case PlanType.FFCFFFCFF:
        return FfcfffcffImpl.adjacentRoads(from);
      case PlanType.FFCFFFFFC:
        return FfcfffffcImpl.adjacentRoads(from);
      case PlanType.FFFFCCCFF:
        return FfffcccffImpl.adjacentRoads(from);
      case PlanType.FFFFFFCFF:
        return FfffffcffImpl.adjacentRoads(from);
      case PlanType.RFFFRFCFR:
        return RfffrfcfrImpl.adjacentRoads(from);
      case PlanType.RFFFRFFFR:
        return RfffrfffrImpl.adjacentRoads(from);
      case PlanType.RFRFCCCFR:
        return RfrfcccfrImpl.adjacentRoads(from);
      case PlanType.RFRFFFCFF:
        return RfrfffcffImpl.adjacentRoads(from);
      case PlanType.RFRFFFCFR:
        return RfrfffcfrImpl.adjacentRoads(from);
      case PlanType.RFRFFFFFR:
        return RfrfffffrImpl.adjacentRoads(from);
      case PlanType.RFRFRFCFF:
        return RfrfrfcffImpl.adjacentRoads(from);
      case PlanType.SFFFFFFFR:
        return SfffffffrImpl.adjacentRoads(from);
      case PlanType.SFRFRFCFR:
        return SfrfrfcfrImpl.adjacentRoads(from);
      case PlanType.SFRFRFFFR:
        return SfrfrfffrImpl.adjacentRoads(from);
      case PlanType.SFRFRFRFR:
        return SfrfrfrfrImpl.adjacentRoads(from);
      case PlanType.WCCCCCCCC:
        return WccccccccImpl.adjacentRoads(from);
      case PlanType.WFFFFFFFF:
        return WffffffffImpl.adjacentRoads(from);
      case PlanType.WFFFFFFFR:
        return WfffffffrImpl.adjacentRoads(from);
      default:
        return [];
    }
  }

  public adjacentCities(from: SpotType): Array<SpotType> {
    switch (this.value) {
      case PlanType.CCCCCCCCC:
        return CccccccccImpl.adjacentCities(from);
      case PlanType.CCCCCFFFC:
        return CccccfffcImpl.adjacentCities(from);
      case PlanType.CCCCCFRFC:
        return CccccfrfcImpl.adjacentCities(from);
      case PlanType.CFFFCFFFC:
        return CfffcfffcImpl.adjacentCities(from);
      case PlanType.CFFFCFRFC:
        return CfffcfrfcImpl.adjacentCities(from);
      case PlanType.FFCFFFCFC:
        return FfcfffcfcImpl.adjacentCities(from);
      case PlanType.FFCFFFCFF:
        return FfcfffcffImpl.adjacentCities(from);
      case PlanType.FFCFFFFFC:
        return FfcfffffcImpl.adjacentCities(from);
      case PlanType.FFFFCCCFF:
        return FfffcccffImpl.adjacentCities(from);
      case PlanType.FFFFFFCFF:
        return FfffffcffImpl.adjacentCities(from);
      case PlanType.RFFFRFCFR:
        return RfffrfcfrImpl.adjacentCities(from);
      case PlanType.RFFFRFFFR:
        return RfffrfffrImpl.adjacentCities(from);
      case PlanType.RFRFCCCFR:
        return RfrfcccfrImpl.adjacentCities(from);
      case PlanType.RFRFFFCFF:
        return RfrfffcffImpl.adjacentCities(from);
      case PlanType.RFRFFFCFR:
        return RfrfffcfrImpl.adjacentCities(from);
      case PlanType.RFRFFFFFR:
        return RfrfffffrImpl.adjacentCities(from);
      case PlanType.RFRFRFCFF:
        return RfrfrfcffImpl.adjacentCities(from);
      case PlanType.SFFFFFFFR:
        return SfffffffrImpl.adjacentCities(from);
      case PlanType.SFRFRFCFR:
        return SfrfrfcfrImpl.adjacentCities(from);
      case PlanType.SFRFRFFFR:
        return SfrfrfffrImpl.adjacentCities(from);
      case PlanType.SFRFRFRFR:
        return SfrfrfrfrImpl.adjacentCities(from);
      case PlanType.WCCCCCCCC:
        return WccccccccImpl.adjacentCities(from);
      case PlanType.WFFFFFFFF:
        return WffffffffImpl.adjacentCities(from);
      case PlanType.WFFFFFFFR:
        return WfffffffrImpl.adjacentCities(from);
      default:
        return [];
    }
  }
}
