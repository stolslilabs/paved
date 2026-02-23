// Source: contracts/src/types/category.cairo
import * as constants from "../constants";
export var CategoryType;
(function (CategoryType) {
    CategoryType["None"] = "None";
    CategoryType["Forest"] = "Forest";
    CategoryType["Road"] = "Road";
    CategoryType["City"] = "City";
    CategoryType["Stop"] = "Stop";
    CategoryType["Wonder"] = "Wonder";
})(CategoryType || (CategoryType = {}));
export class Category {
    value;
    constructor(category) {
        this.value = category;
    }
    into() {
        return Object.values(CategoryType).indexOf(this.value);
    }
    static from(index) {
        const category = Object.values(CategoryType)[index];
        return new Category(category);
    }
    static fromChar(category) {
        switch (category) {
            case "C":
                return new Category(CategoryType.City);
            case "F":
                return new Category(CategoryType.Forest);
            case "R":
                return new Category(CategoryType.Road);
            case "S":
                return new Category(CategoryType.Stop);
            case "W":
                return new Category(CategoryType.Wonder);
            default:
                return new Category(CategoryType.None);
        }
    }
    basePoints() {
        switch (this.value) {
            case CategoryType.None:
                return 0;
            case CategoryType.Forest:
                return constants.FOREST_BASE_POINTS;
            case CategoryType.Road:
                return constants.ROAD_BASE_POINTS;
            case CategoryType.City:
                return constants.CITY_BASE_POINTS;
            case CategoryType.Stop:
                return 0;
            case CategoryType.Wonder:
                return constants.WONDER_BASE_POINTS;
        }
    }
}
//# sourceMappingURL=category.js.map