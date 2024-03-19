// Source: contracts/src/types/role.cairo

import { CategoryType } from "./category";

export enum RoleType {
  None = "None",
  Lord = "Lord",
  Lady = "Lady",
  Adventurer = "Adventurer",
  Paladin = "Paladin",
  Algrim = "Algrim",
  Woodsman = "Woodsman",
  Herdsman = "Herdsman",
}

export class Role {
  value: RoleType;

  constructor(role: RoleType) {
    this.value = role;
  }

  public into(): number {
    return Object.values(RoleType).indexOf(this.value);
  }

  public static from(index: number): Role {
    const plan = Object.values(RoleType)[index];
    return new Role(plan);
  }

  public weight(category: CategoryType): number {
    switch (this.value) {
      case RoleType.None:
        return 0;
      case RoleType.Lord:
        switch (category) {
          case CategoryType.None:
            return 0;
          case CategoryType.Forest:
            return 0;
          case CategoryType.Road:
            return 1;
          case CategoryType.City:
            return 1;
          case CategoryType.Stop:
            return 0;
          case CategoryType.Wonder:
            return 1;
        }
      case RoleType.Lady:
        switch (category) {
          case CategoryType.None:
            return 0;
          case CategoryType.Forest:
            return 0;
          case CategoryType.Road:
            return 1;
          case CategoryType.City:
            return 1;
          case CategoryType.Stop:
            return 0;
          case CategoryType.Wonder:
            return 1;
        }
      case RoleType.Adventurer:
        switch (category) {
          case CategoryType.None:
            return 0;
          case CategoryType.Forest:
            return 0;
          case CategoryType.Road:
            return 2;
          case CategoryType.City:
            return 0;
          case CategoryType.Stop:
            return 0;
          case CategoryType.Wonder:
            return 1;
        }
      case RoleType.Paladin:
        switch (category) {
          case CategoryType.None:
            return 0;
          case CategoryType.Forest:
            return 0;
          case CategoryType.Road:
            return 0;
          case CategoryType.City:
            return 2;
          case CategoryType.Stop:
            return 0;
          case CategoryType.Wonder:
            return 1;
        }
      case RoleType.Algrim:
        switch (category) {
          case CategoryType.None:
            return 0;
          case CategoryType.Forest:
            return 0;
          case CategoryType.Road:
            return 1;
          case CategoryType.City:
            return 1;
          case CategoryType.Stop:
            return 0;
          case CategoryType.Wonder:
            return 2;
        }
      case RoleType.Woodsman:
        switch (category) {
          case CategoryType.None:
            return 0;
          case CategoryType.Forest:
            return 1;
          case CategoryType.Road:
            return 1;
          case CategoryType.City:
            return 0;
          case CategoryType.Stop:
            return 0;
          case CategoryType.Wonder:
            return 0;
        }
      case RoleType.Herdsman:
        switch (category) {
          case CategoryType.None:
            return 0;
          case CategoryType.Forest:
            return 1;
          case CategoryType.Road:
            return 0;
          case CategoryType.City:
            return 1;
          case CategoryType.Stop:
            return 0;
          case CategoryType.Wonder:
            return 0;
        }
    }
  }

  public power(category: CategoryType): number {
    switch (this.value) {
      case RoleType.None:
        return 0;
      case RoleType.Lord:
        switch (category) {
          case CategoryType.None:
            return 0;
          case CategoryType.Forest:
            return 0;
          case CategoryType.Road:
            return 1;
          case CategoryType.City:
            return 1;
          case CategoryType.Stop:
            return 0;
          case CategoryType.Wonder:
            return 1;
        }
      case RoleType.Lady:
        switch (category) {
          case CategoryType.None:
            return 0;
          case CategoryType.Forest:
            return 0;
          case CategoryType.Road:
            return 1;
          case CategoryType.City:
            return 1;
          case CategoryType.Stop:
            return 0;
          case CategoryType.Wonder:
            return 1;
        }
      case RoleType.Adventurer:
        switch (category) {
          case CategoryType.None:
            return 0;
          case CategoryType.Forest:
            return 0;
          case CategoryType.Road:
            return 2;
          case CategoryType.City:
            return 0;
          case CategoryType.Stop:
            return 0;
          case CategoryType.Wonder:
            return 1;
        }
      case RoleType.Paladin:
        switch (category) {
          case CategoryType.None:
            return 0;
          case CategoryType.Forest:
            return 0;
          case CategoryType.Road:
            return 0;
          case CategoryType.City:
            return 2;
          case CategoryType.Stop:
            return 0;
          case CategoryType.Wonder:
            return 1;
        }
      case RoleType.Algrim:
        switch (category) {
          case CategoryType.None:
            return 0;
          case CategoryType.Forest:
            return 0;
          case CategoryType.Road:
            return 1;
          case CategoryType.City:
            return 1;
          case CategoryType.Stop:
            return 0;
          case CategoryType.Wonder:
            return 2;
        }
      case RoleType.Woodsman:
        switch (category) {
          case CategoryType.None:
            return 0;
          case CategoryType.Forest:
            return 1;
          case CategoryType.Road:
            return 1;
          case CategoryType.City:
            return 0;
          case CategoryType.Stop:
            return 0;
          case CategoryType.Wonder:
            return 0;
        }
      case RoleType.Herdsman:
        switch (category) {
          case CategoryType.None:
            return 0;
          case CategoryType.Forest:
            return 1;
          case CategoryType.Road:
            return 0;
          case CategoryType.City:
            return 1;
          case CategoryType.Stop:
            return 0;
          case CategoryType.Wonder:
            return 0;
        }
    }
  }

  public isAllowed(category: CategoryType): boolean {
    switch (this.value) {
      case RoleType.None:
        return false;
      case RoleType.Lord:
        switch (category) {
          case CategoryType.None:
            return false;
          case CategoryType.Forest:
            return false;
          case CategoryType.Road:
            return true;
          case CategoryType.City:
            return true;
          case CategoryType.Stop:
            return false;
          case CategoryType.Wonder:
            return true;
        }
      case RoleType.Lady:
        switch (category) {
          case CategoryType.None:
            return false;
          case CategoryType.Forest:
            return false;
          case CategoryType.Road:
            return true;
          case CategoryType.City:
            return true;
          case CategoryType.Stop:
            return false;
          case CategoryType.Wonder:
            return true;
        }
      case RoleType.Adventurer:
        switch (category) {
          case CategoryType.None:
            return false;
          case CategoryType.Forest:
            return false;
          case CategoryType.Road:
            return true;
          case CategoryType.City:
            return false;
          case CategoryType.Stop:
            return false;
          case CategoryType.Wonder:
            return true;
        }
      case RoleType.Paladin:
        switch (category) {
          case CategoryType.None:
            return false;
          case CategoryType.Forest:
            return false;
          case CategoryType.Road:
            return false;
          case CategoryType.City:
            return true;
          case CategoryType.Stop:
            return false;
          case CategoryType.Wonder:
            return true;
        }
      case RoleType.Algrim:
        switch (category) {
          case CategoryType.None:
            return false;
          case CategoryType.Forest:
            return false;
          case CategoryType.Road:
            return true;
          case CategoryType.City:
            return true;
          case CategoryType.Stop:
            return false;
          case CategoryType.Wonder:
            return true;
        }
      case RoleType.Woodsman:
        switch (category) {
          case CategoryType.None:
            return false;
          case CategoryType.Forest:
            return true;
          case CategoryType.Road:
            return true;
          case CategoryType.City:
            return false;
          case CategoryType.Stop:
            return false;
          case CategoryType.Wonder:
            return false;
        }
      case RoleType.Herdsman:
        switch (category) {
          case CategoryType.None:
            return false;
          case CategoryType.Forest:
            return true;
          case CategoryType.Road:
            return false;
          case CategoryType.City:
            return true;
          case CategoryType.Stop:
            return false;
          case CategoryType.Wonder:
            return false;
        }
    }
  }
}

export class AssertImpl {
  constructor() {}

  public static assertIsAllowed(role: Role, category: CategoryType): void {
    if (!role.isAllowed(category)) {
      throw new Error("RoleType: not allowed");
    }
  }
}
