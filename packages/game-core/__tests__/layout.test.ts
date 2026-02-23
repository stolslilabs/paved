import { describe, it, expect } from "vitest";
import { Layout } from "../src/types/layout";
import { Plan, PlanType } from "../src/types/plan";
import { OrientationType } from "../src/types/orientation";
import { CategoryType } from "../src/types/category";
import { SpotType } from "../src/types/spot";
import { Direction, DirectionType } from "../src/types/direction";

describe("Layout", () => {
  // RFFFRFCFR: center=R, NW=F, N=F, NE=F, E=R, SE=F, S=C, SW=F, W=R
  const plan = new Plan(PlanType.RFFFRFCFR);

  describe("Layout.from(plan, North) preserves order", () => {
    const layout = Layout.from(plan, OrientationType.North);

    it("center is Road", () => {
      expect(layout.center.value).toBe(CategoryType.Road);
    });

    it("northWest is Forest", () => {
      expect(layout.northWest.value).toBe(CategoryType.Forest);
    });

    it("north is Forest", () => {
      expect(layout.north.value).toBe(CategoryType.Forest);
    });

    it("northEast is Forest", () => {
      expect(layout.northEast.value).toBe(CategoryType.Forest);
    });

    it("east is Road", () => {
      expect(layout.east.value).toBe(CategoryType.Road);
    });

    it("southEast is Forest", () => {
      expect(layout.southEast.value).toBe(CategoryType.Forest);
    });

    it("south is City", () => {
      expect(layout.south.value).toBe(CategoryType.City);
    });

    it("southWest is Forest", () => {
      expect(layout.southWest.value).toBe(CategoryType.Forest);
    });

    it("west is Road", () => {
      expect(layout.west.value).toBe(CategoryType.Road);
    });
  });

  describe("Layout.from(plan, East) rotates positions", () => {
    // When rotated East: the tile's visual west side becomes north.
    // Unpack: center=R, NW=F, N=F, NE=F, E=R, SE=F, S=C, SW=F, W=R
    // East rotation: new layout = (center, SW, W, NW, N, NE, E, SE, S)
    // = (R, F, R, F, F, F, R, F, C)
    const layout = Layout.from(plan, OrientationType.East);

    it("center stays Road", () => {
      expect(layout.center.value).toBe(CategoryType.Road);
    });

    it("northWest becomes what was SouthWest (Forest)", () => {
      expect(layout.northWest.value).toBe(CategoryType.Forest);
    });

    it("north becomes what was West (Road)", () => {
      expect(layout.north.value).toBe(CategoryType.Road);
    });

    it("northEast becomes what was NorthWest (Forest)", () => {
      expect(layout.northEast.value).toBe(CategoryType.Forest);
    });

    it("east becomes what was North (Forest)", () => {
      expect(layout.east.value).toBe(CategoryType.Forest);
    });

    it("southEast becomes what was NorthEast (Forest)", () => {
      expect(layout.southEast.value).toBe(CategoryType.Forest);
    });

    it("south becomes what was East (Road)", () => {
      expect(layout.south.value).toBe(CategoryType.Road);
    });

    it("southWest becomes what was SouthEast (Forest)", () => {
      expect(layout.southWest.value).toBe(CategoryType.Forest);
    });

    it("west becomes what was South (City)", () => {
      expect(layout.west.value).toBe(CategoryType.City);
    });
  });

  describe("isCompatible()", () => {
    it("two tiles with matching edge categories return true", () => {
      // RFFFRFCFR north-oriented: north=Forest, south=City, east=Road, west=Road
      const layoutA = Layout.from(plan, OrientationType.North);

      // For north compatibility, we need reference.south === layoutA.north (Forest)
      // RFFFRFCFR south-oriented would have different edge arrangement
      // Let's use CCCCCCCCC which has all City — its south=City
      // layoutA.north = Forest, so that won't match.

      // Instead let's construct a scenario: layoutA.east = Road
      // We need a reference whose west = Road
      // RFFFRFCFR north-oriented has west = Road
      const layoutB = Layout.from(plan, OrientationType.North);

      // layoutA.east = Road, layoutB.west = Road => compatible on East
      const eastDir = new Direction(DirectionType.East);
      expect(layoutA.isCompatible(layoutB, eastDir)).toBe(true);
    });

    it("mismatched edges return false", () => {
      const layoutA = Layout.from(plan, OrientationType.North);
      // layoutA.north = Forest
      // We need a reference whose south != Forest
      // CCCCCCCCC north-oriented: all City, south = City
      const cccPlan = new Plan(PlanType.CCCCCCCCC);
      const layoutB = Layout.from(cccPlan, OrientationType.North);

      const northDir = new Direction(DirectionType.North);
      // layoutA.north = Forest, layoutB.south = City => not compatible
      expect(layoutA.isCompatible(layoutB, northDir)).toBe(false);
    });

    it("north compatibility checks this.north vs reference.south", () => {
      // CCCCCCCCC all City
      const cccLayout = Layout.from(new Plan(PlanType.CCCCCCCCC), OrientationType.North);
      // north = City, south = City
      const northDir = new Direction(DirectionType.North);
      // cccLayout.north = City, cccLayout.south = City => match
      expect(cccLayout.isCompatible(cccLayout, northDir)).toBe(true);
    });

    it("south compatibility checks this.south vs reference.north", () => {
      const layoutA = Layout.from(plan, OrientationType.North);
      // layoutA.south = City
      // CCCCCCCCC has north = City
      const cccLayout = Layout.from(new Plan(PlanType.CCCCCCCCC), OrientationType.North);
      const southDir = new Direction(DirectionType.South);
      // layoutA.south = City, cccLayout.north = City => match
      expect(layoutA.isCompatible(cccLayout, southDir)).toBe(true);
    });

    it("west compatibility checks this.west vs reference.east", () => {
      const layoutA = Layout.from(plan, OrientationType.North);
      // layoutA.west = Road
      // Need reference.east = Road
      // RFFFRFCFR north-oriented: east = Road
      const layoutB = Layout.from(plan, OrientationType.North);
      const westDir = new Direction(DirectionType.West);
      expect(layoutA.isCompatible(layoutB, westDir)).toBe(true);
    });

    it("returns false for None direction", () => {
      const layoutA = Layout.from(plan, OrientationType.North);
      const layoutB = Layout.from(plan, OrientationType.North);
      const noneDir = new Direction(DirectionType.None);
      expect(layoutA.isCompatible(layoutB, noneDir)).toBe(false);
    });
  });

  describe("getCategory()", () => {
    const layout = Layout.from(plan, OrientationType.North);

    it("returns correct category for Center", () => {
      expect(layout.getCategory(SpotType.Center).value).toBe(CategoryType.Road);
    });

    it("returns correct category for North", () => {
      expect(layout.getCategory(SpotType.North).value).toBe(CategoryType.Forest);
    });

    it("returns correct category for East", () => {
      expect(layout.getCategory(SpotType.East).value).toBe(CategoryType.Road);
    });

    it("returns correct category for South", () => {
      expect(layout.getCategory(SpotType.South).value).toBe(CategoryType.City);
    });

    it("returns correct category for West", () => {
      expect(layout.getCategory(SpotType.West).value).toBe(CategoryType.Road);
    });

    it("returns correct category for NorthWest", () => {
      expect(layout.getCategory(SpotType.NorthWest).value).toBe(CategoryType.Forest);
    });

    it("returns correct category for NorthEast", () => {
      expect(layout.getCategory(SpotType.NorthEast).value).toBe(CategoryType.Forest);
    });

    it("returns correct category for SouthEast", () => {
      expect(layout.getCategory(SpotType.SouthEast).value).toBe(CategoryType.Forest);
    });

    it("returns correct category for SouthWest", () => {
      expect(layout.getCategory(SpotType.SouthWest).value).toBe(CategoryType.Forest);
    });

    it("returns None for SpotType.None", () => {
      expect(layout.getCategory(SpotType.None).value).toBe(CategoryType.None);
    });
  });
});
