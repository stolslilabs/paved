import { describe, it, expect } from "vitest";
import { Category, CategoryType } from "../src/types/category";

describe("Category", () => {
  describe("fromChar()", () => {
    it('fromChar("C") returns City', () => {
      expect(Category.fromChar("C").value).toBe(CategoryType.City);
    });

    it('fromChar("F") returns Forest', () => {
      expect(Category.fromChar("F").value).toBe(CategoryType.Forest);
    });

    it('fromChar("R") returns Road', () => {
      expect(Category.fromChar("R").value).toBe(CategoryType.Road);
    });

    it('fromChar("S") returns Stop', () => {
      expect(Category.fromChar("S").value).toBe(CategoryType.Stop);
    });

    it('fromChar("W") returns Wonder', () => {
      expect(Category.fromChar("W").value).toBe(CategoryType.Wonder);
    });

    it('fromChar("X") returns None', () => {
      expect(Category.fromChar("X").value).toBe(CategoryType.None);
    });

    it('fromChar("") returns None', () => {
      expect(Category.fromChar("").value).toBe(CategoryType.None);
    });
  });

  describe("basePoints()", () => {
    it("Road = 100", () => {
      expect(new Category(CategoryType.Road).basePoints()).toBe(100);
    });

    it("Forest = 100", () => {
      expect(new Category(CategoryType.Forest).basePoints()).toBe(100);
    });

    it("City = 200", () => {
      expect(new Category(CategoryType.City).basePoints()).toBe(200);
    });

    it("Wonder = 800", () => {
      expect(new Category(CategoryType.Wonder).basePoints()).toBe(800);
    });

    it("None = 0", () => {
      expect(new Category(CategoryType.None).basePoints()).toBe(0);
    });

    it("Stop = 0", () => {
      expect(new Category(CategoryType.Stop).basePoints()).toBe(0);
    });
  });

  describe("into() and from() round-trip", () => {
    it("round-trips all 6 values", () => {
      for (let i = 0; i < 6; i++) {
        const cat = Category.from(i);
        expect(cat.into()).toBe(i);
      }
    });

    it("into() returns correct indices", () => {
      expect(new Category(CategoryType.None).into()).toBe(0);
      expect(new Category(CategoryType.Forest).into()).toBe(1);
      expect(new Category(CategoryType.Road).into()).toBe(2);
      expect(new Category(CategoryType.City).into()).toBe(3);
      expect(new Category(CategoryType.Stop).into()).toBe(4);
      expect(new Category(CategoryType.Wonder).into()).toBe(5);
    });
  });
});
