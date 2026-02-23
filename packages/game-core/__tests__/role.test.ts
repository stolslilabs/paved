import { describe, it, expect } from "vitest";
import { Role, RoleType } from "../src/types/role";
import { CategoryType } from "../src/types/category";

describe("Role", () => {
  describe("Lord", () => {
    const lord = new Role(RoleType.Lord);

    it("weight/power 1/1 for Road", () => {
      expect(lord.weight(CategoryType.Road)).toBe(1);
      expect(lord.power(CategoryType.Road)).toBe(1);
    });

    it("weight/power 1/1 for City", () => {
      expect(lord.weight(CategoryType.City)).toBe(1);
      expect(lord.power(CategoryType.City)).toBe(1);
    });

    it("weight/power 1/1 for Wonder", () => {
      expect(lord.weight(CategoryType.Wonder)).toBe(1);
      expect(lord.power(CategoryType.Wonder)).toBe(1);
    });

    it("isAllowed for Road, City, Wonder", () => {
      expect(lord.isAllowed(CategoryType.Road)).toBe(true);
      expect(lord.isAllowed(CategoryType.City)).toBe(true);
      expect(lord.isAllowed(CategoryType.Wonder)).toBe(true);
    });

    it("NOT allowed for Forest, Stop, None", () => {
      expect(lord.isAllowed(CategoryType.Forest)).toBe(false);
      expect(lord.isAllowed(CategoryType.Stop)).toBe(false);
      expect(lord.isAllowed(CategoryType.None)).toBe(false);
    });

    it("weight 0 for Forest, Stop, None", () => {
      expect(lord.weight(CategoryType.Forest)).toBe(0);
      expect(lord.weight(CategoryType.Stop)).toBe(0);
      expect(lord.weight(CategoryType.None)).toBe(0);
    });
  });

  describe("Lady", () => {
    const lady = new Role(RoleType.Lady);

    it("weight/power 1/1 for Road", () => {
      expect(lady.weight(CategoryType.Road)).toBe(1);
      expect(lady.power(CategoryType.Road)).toBe(1);
    });

    it("weight/power 1/1 for City", () => {
      expect(lady.weight(CategoryType.City)).toBe(1);
      expect(lady.power(CategoryType.City)).toBe(1);
    });

    it("weight/power 1/1 for Wonder", () => {
      expect(lady.weight(CategoryType.Wonder)).toBe(1);
      expect(lady.power(CategoryType.Wonder)).toBe(1);
    });

    it("isAllowed for Road, City, Wonder", () => {
      expect(lady.isAllowed(CategoryType.Road)).toBe(true);
      expect(lady.isAllowed(CategoryType.City)).toBe(true);
      expect(lady.isAllowed(CategoryType.Wonder)).toBe(true);
    });

    it("NOT allowed for Forest, Stop, None", () => {
      expect(lady.isAllowed(CategoryType.Forest)).toBe(false);
      expect(lady.isAllowed(CategoryType.Stop)).toBe(false);
      expect(lady.isAllowed(CategoryType.None)).toBe(false);
    });
  });

  describe("Adventurer", () => {
    const adv = new Role(RoleType.Adventurer);

    it("weight/power 2/2 for Road", () => {
      expect(adv.weight(CategoryType.Road)).toBe(2);
      expect(adv.power(CategoryType.Road)).toBe(2);
    });

    it("weight/power 1/1 for Wonder", () => {
      expect(adv.weight(CategoryType.Wonder)).toBe(1);
      expect(adv.power(CategoryType.Wonder)).toBe(1);
    });

    it("weight/power 0/0 for City (NOT allowed)", () => {
      expect(adv.weight(CategoryType.City)).toBe(0);
      expect(adv.power(CategoryType.City)).toBe(0);
      expect(adv.isAllowed(CategoryType.City)).toBe(false);
    });

    it("isAllowed for Road and Wonder", () => {
      expect(adv.isAllowed(CategoryType.Road)).toBe(true);
      expect(adv.isAllowed(CategoryType.Wonder)).toBe(true);
    });

    it("NOT allowed for Forest, Stop, None", () => {
      expect(adv.isAllowed(CategoryType.Forest)).toBe(false);
      expect(adv.isAllowed(CategoryType.Stop)).toBe(false);
      expect(adv.isAllowed(CategoryType.None)).toBe(false);
    });
  });

  describe("Paladin", () => {
    const pal = new Role(RoleType.Paladin);

    it("weight/power 2/2 for City", () => {
      expect(pal.weight(CategoryType.City)).toBe(2);
      expect(pal.power(CategoryType.City)).toBe(2);
    });

    it("weight/power 1/1 for Wonder", () => {
      expect(pal.weight(CategoryType.Wonder)).toBe(1);
      expect(pal.power(CategoryType.Wonder)).toBe(1);
    });

    it("weight/power 0/0 for Road (NOT allowed)", () => {
      expect(pal.weight(CategoryType.Road)).toBe(0);
      expect(pal.power(CategoryType.Road)).toBe(0);
      expect(pal.isAllowed(CategoryType.Road)).toBe(false);
    });

    it("isAllowed for City and Wonder", () => {
      expect(pal.isAllowed(CategoryType.City)).toBe(true);
      expect(pal.isAllowed(CategoryType.Wonder)).toBe(true);
    });

    it("NOT allowed for Forest, Stop, None", () => {
      expect(pal.isAllowed(CategoryType.Forest)).toBe(false);
      expect(pal.isAllowed(CategoryType.Stop)).toBe(false);
      expect(pal.isAllowed(CategoryType.None)).toBe(false);
    });
  });

  describe("Pilgrim", () => {
    const pil = new Role(RoleType.Pilgrim);

    it("weight/power 2/2 for Wonder", () => {
      expect(pil.weight(CategoryType.Wonder)).toBe(2);
      expect(pil.power(CategoryType.Wonder)).toBe(2);
    });

    it("weight/power 1/1 for Road", () => {
      expect(pil.weight(CategoryType.Road)).toBe(1);
      expect(pil.power(CategoryType.Road)).toBe(1);
    });

    it("weight/power 1/1 for City", () => {
      expect(pil.weight(CategoryType.City)).toBe(1);
      expect(pil.power(CategoryType.City)).toBe(1);
    });

    it("isAllowed for Road, City, Wonder", () => {
      expect(pil.isAllowed(CategoryType.Road)).toBe(true);
      expect(pil.isAllowed(CategoryType.City)).toBe(true);
      expect(pil.isAllowed(CategoryType.Wonder)).toBe(true);
    });

    it("NOT allowed for Forest, Stop, None", () => {
      expect(pil.isAllowed(CategoryType.Forest)).toBe(false);
      expect(pil.isAllowed(CategoryType.Stop)).toBe(false);
      expect(pil.isAllowed(CategoryType.None)).toBe(false);
    });
  });

  describe("Woodsman", () => {
    const wood = new Role(RoleType.Woodsman);

    it("weight/power 1/1 for Forest", () => {
      expect(wood.weight(CategoryType.Forest)).toBe(1);
      expect(wood.power(CategoryType.Forest)).toBe(1);
    });

    it("weight/power 1/1 for Road", () => {
      expect(wood.weight(CategoryType.Road)).toBe(1);
      expect(wood.power(CategoryType.Road)).toBe(1);
    });

    it("NOT allowed for City and Wonder", () => {
      expect(wood.isAllowed(CategoryType.City)).toBe(false);
      expect(wood.isAllowed(CategoryType.Wonder)).toBe(false);
      expect(wood.weight(CategoryType.City)).toBe(0);
      expect(wood.weight(CategoryType.Wonder)).toBe(0);
    });

    it("isAllowed for Forest and Road", () => {
      expect(wood.isAllowed(CategoryType.Forest)).toBe(true);
      expect(wood.isAllowed(CategoryType.Road)).toBe(true);
    });

    it("NOT allowed for Stop, None", () => {
      expect(wood.isAllowed(CategoryType.Stop)).toBe(false);
      expect(wood.isAllowed(CategoryType.None)).toBe(false);
    });
  });

  describe("Herdsman", () => {
    const herd = new Role(RoleType.Herdsman);

    it("weight/power 1/1 for Forest", () => {
      expect(herd.weight(CategoryType.Forest)).toBe(1);
      expect(herd.power(CategoryType.Forest)).toBe(1);
    });

    it("weight/power 1/1 for City", () => {
      expect(herd.weight(CategoryType.City)).toBe(1);
      expect(herd.power(CategoryType.City)).toBe(1);
    });

    it("NOT allowed for Road and Wonder", () => {
      expect(herd.isAllowed(CategoryType.Road)).toBe(false);
      expect(herd.isAllowed(CategoryType.Wonder)).toBe(false);
      expect(herd.weight(CategoryType.Road)).toBe(0);
      expect(herd.weight(CategoryType.Wonder)).toBe(0);
    });

    it("isAllowed for Forest and City", () => {
      expect(herd.isAllowed(CategoryType.Forest)).toBe(true);
      expect(herd.isAllowed(CategoryType.City)).toBe(true);
    });

    it("NOT allowed for Stop, None", () => {
      expect(herd.isAllowed(CategoryType.Stop)).toBe(false);
      expect(herd.isAllowed(CategoryType.None)).toBe(false);
    });
  });

  describe("None", () => {
    const none = new Role(RoleType.None);

    it("all weights are 0", () => {
      for (const cat of Object.values(CategoryType)) {
        expect(none.weight(cat)).toBe(0);
      }
    });

    it("all powers are 0", () => {
      for (const cat of Object.values(CategoryType)) {
        expect(none.power(cat)).toBe(0);
      }
    });

    it("isAllowed is always false", () => {
      for (const cat of Object.values(CategoryType)) {
        expect(none.isAllowed(cat)).toBe(false);
      }
    });
  });

  describe("into() and from() round-trip", () => {
    it("round-trips all 8 values", () => {
      for (let i = 0; i < 8; i++) {
        const role = Role.from(i);
        expect(role.into()).toBe(i);
      }
    });
  });
});
