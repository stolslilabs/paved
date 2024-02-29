// Source: contracts/src/types/plan.cairo

import { Configuration as CccccccccImpl } from "../layouts/ccccccccc";
import { Configuration as CccccfffcImpl } from "../layouts/cccccfffc";
import { Configuration as CccccfrfcImpl } from "../layouts/cccccfrfc";
import { Configuration as CfcfcccccImpl } from "../layouts/cfcfccccc";
import { Configuration as CfcfcfcfcImpl } from "../layouts/cfcfcfcfc";
import { Configuration as CfcfcfffcImpl } from "../layouts/cfcfcfffc";
import { Configuration as CffcfcffcImpl } from "../layouts/cffcfcffc";
import { Configuration as CfffcfffcImpl } from "../layouts/cfffcfffc";
import { Configuration as CfffcfrfcImpl } from "../layouts/cfffcfrfc";
import { Configuration as FccfcccfcImpl } from "../layouts/fccfcccfc";
import { Configuration as FccfcfcfcImpl } from "../layouts/fccfcfcfc";
import { Configuration as FfcfcccffImpl } from "../layouts/ffcfcccff";
import { Configuration as FfcfcfcfcImpl } from "../layouts/ffcfcfcfc";
import { Configuration as FfcfffcccImpl } from "../layouts/ffcfffccc";
import { Configuration as FfcfffcfcImpl } from "../layouts/ffcfffcfc";
import { Configuration as FfcfffcffImpl } from "../layouts/ffcfffcff";
import { Configuration as FfcfffffcImpl } from "../layouts/ffcfffffc";
import { Configuration as FfffcccffImpl } from "../layouts/ffffcccff";
import { Configuration as FfffffcffImpl } from "../layouts/ffffffcff";
import { Configuration as RfffffcfrImpl } from "../layouts/rfffffcfr";
import { Configuration as RfffrfcffImpl } from "../layouts/rfffrfcff";
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
  CFCFCCCCC = "CFCFCCCCC",
  CFCFCFCFC = "CFCFCFCFC",
  CFCFCFFFC = "CFCFCFFFC",
  CFFCFCFFC = "CFFCFCFFC",
  CFFFCFFFC = "CFFFCFFFC",
  CFFFCFRFC = "CFFFCFRFC",
  FCCFCCCFC = "FCCFCCCFC",
  FCCFCFCFC = "FCCFCFCFC",
  FFCFCCCFF = "FFCFCCCFF",
  FFCFCFCFC = "FFCFCFCFC",
  FFCFFFCCC = "FFCFFFCCC",
  FFCFFFCFC = "FFCFFFCFC",
  FFCFFFCFF = "FFCFFFCFF",
  FFCFFFFFC = "FFCFFFFFC",
  FFFFCCCFF = "FFFFCCCFF",
  FFFFFFCFF = "FFFFFFCFF",
  RFFFFFCFR = "RFFFFFCFR",
  RFFFRFCFF = "RFFFRFCFF",
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
      case PlanType.CFCFCCCCC:
        return CfcfcccccImpl.starts();
      case PlanType.CFCFCFCFC:
        return CfcfcfcfcImpl.starts();
      case PlanType.CFCFCFFFC:
        return CfcfcfffcImpl.starts();
      case PlanType.CFFCFCFFC:
        return CffcfcffcImpl.starts();
      case PlanType.CFFFCFFFC:
        return CfffcfffcImpl.starts();
      case PlanType.CFFFCFRFC:
        return CfffcfrfcImpl.starts();
      case PlanType.FCCFCCCFC:
        return FccfcccfcImpl.starts();
      case PlanType.FCCFCFCFC:
        return FccfcfcfcImpl.starts();
      case PlanType.FFCFCCCFF:
        return FfcfcccffImpl.starts();
      case PlanType.FFCFCFCFC:
        return FfcfcfcfcImpl.starts();
      case PlanType.FFCFFFCCC:
        return FfcfffcccImpl.starts();
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
      case PlanType.RFFFFFCFR:
        return RfffffcfrImpl.starts();
      case PlanType.RFFFRFCFF:
        return RfffrfcffImpl.starts();
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
      case PlanType.CFCFCCCCC:
        return CfcfcccccImpl.moves(from);
      case PlanType.CFCFCFCFC:
        return CfcfcfcfcImpl.moves(from);
      case PlanType.CFCFCFFFC:
        return CfcfcfffcImpl.moves(from);
      case PlanType.CFFCFCFFC:
        return CffcfcffcImpl.moves(from);
      case PlanType.CFFFCFFFC:
        return CfffcfffcImpl.moves(from);
      case PlanType.CFFFCFRFC:
        return CfffcfrfcImpl.moves(from);
      case PlanType.FCCFCCCFC:
        return FccfcccfcImpl.moves(from);
      case PlanType.FCCFCFCFC:
        return FccfcfcfcImpl.moves(from);
      case PlanType.FFCFCCCFF:
        return FfcfcccffImpl.moves(from);
      case PlanType.FFCFCFCFC:
        return FfcfcfcfcImpl.moves(from);
      case PlanType.FFCFFFCCC:
        return FfcfffcccImpl.moves(from);
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
      case PlanType.RFFFFFCFR:
        return RfffffcfrImpl.moves(from);
      case PlanType.RFFFRFCFF:
        return RfffrfcffImpl.moves(from);
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
      case PlanType.CFCFCCCCC:
        return CfcfcccccImpl.area(from);
      case PlanType.CFCFCFCFC:
        return CfcfcfcfcImpl.area(from);
      case PlanType.CFCFCFFFC:
        return CfcfcfffcImpl.area(from);
      case PlanType.CFFCFCFFC:
        return CffcfcffcImpl.area(from);
      case PlanType.CFFFCFFFC:
        return CfffcfffcImpl.area(from);
      case PlanType.CFFFCFRFC:
        return CfffcfrfcImpl.area(from);
      case PlanType.FCCFCCCFC:
        return FccfcccfcImpl.area(from);
      case PlanType.FCCFCFCFC:
        return FccfcfcfcImpl.area(from);
      case PlanType.FFCFCCCFF:
        return FfcfcccffImpl.area(from);
      case PlanType.FFCFCFCFC:
        return FfcfcfcfcImpl.area(from);
      case PlanType.FFCFFFCCC:
        return FfcfffcccImpl.area(from);
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
      case PlanType.RFFFFFCFR:
        return RfffffcfrImpl.area(from);
      case PlanType.RFFFRFCFF:
        return RfffrfcffImpl.area(from);
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
      case PlanType.CFCFCCCCC:
        return CfcfcccccImpl.adjacentRoads(from);
      case PlanType.CFCFCFCFC:
        return CfcfcfcfcImpl.adjacentRoads(from);
      case PlanType.CFCFCFFFC:
        return CfcfcfffcImpl.adjacentRoads(from);
      case PlanType.CFFCFCFFC:
        return CffcfcffcImpl.adjacentRoads(from);
      case PlanType.CFFFCFFFC:
        return CfffcfffcImpl.adjacentRoads(from);
      case PlanType.CFFFCFRFC:
        return CfffcfrfcImpl.adjacentRoads(from);
      case PlanType.FCCFCCCFC:
        return FccfcccfcImpl.adjacentRoads(from);
      case PlanType.FCCFCFCFC:
        return FccfcfcfcImpl.adjacentRoads(from);
      case PlanType.FFCFCCCFF:
        return FfcfcccffImpl.adjacentRoads(from);
      case PlanType.FFCFCFCFC:
        return FfcfcfcfcImpl.adjacentRoads(from);
      case PlanType.FFCFFFCCC:
        return FfcfffcccImpl.adjacentRoads(from);
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
      case PlanType.RFFFFFCFR:
        return RfffffcfrImpl.adjacentRoads(from);
      case PlanType.RFFFRFCFF:
        return RfffrfcffImpl.adjacentRoads(from);
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
      case PlanType.CFCFCCCCC:
        return CfcfcccccImpl.adjacentCities(from);
      case PlanType.CFCFCFCFC:
        return CfcfcfcfcImpl.adjacentCities(from);
      case PlanType.CFCFCFFFC:
        return CfcfcfffcImpl.adjacentCities(from);
      case PlanType.CFFCFCFFC:
        return CffcfcffcImpl.adjacentCities(from);
      case PlanType.CFFFCFFFC:
        return CfffcfffcImpl.adjacentCities(from);
      case PlanType.CFFFCFRFC:
        return CfffcfrfcImpl.adjacentCities(from);
      case PlanType.FCCFCCCFC:
        return FccfcccfcImpl.adjacentCities(from);
      case PlanType.FCCFCFCFC:
        return FccfcfcfcImpl.adjacentCities(from);
      case PlanType.FFCFCCCFF:
        return FfcfcccffImpl.adjacentCities(from);
      case PlanType.FFCFCFCFC:
        return FfcfcfcfcImpl.adjacentCities(from);
      case PlanType.FFCFFFCCC:
        return FfcfffcccImpl.adjacentCities(from);
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
      case PlanType.RFFFFFCFR:
        return RfffffcfrImpl.adjacentCities(from);
      case PlanType.RFFFRFCFF:
        return RfffrfcffImpl.adjacentCities(from);
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
