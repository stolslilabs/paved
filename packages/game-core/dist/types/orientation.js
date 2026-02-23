// Source: contracts/src/types/orientation.cairo
export var OrientationType;
(function (OrientationType) {
    OrientationType["None"] = "None";
    OrientationType["North"] = "North";
    OrientationType["East"] = "East";
    OrientationType["South"] = "South";
    OrientationType["West"] = "West";
})(OrientationType || (OrientationType = {}));
export class Orientation {
    value;
    constructor(value) {
        this.value = value;
    }
    into() {
        return Object.values(OrientationType).indexOf(this.value);
    }
    static from(index) {
        const orientation = Object.values(OrientationType)[index];
        return new Orientation(orientation);
    }
}
//# sourceMappingURL=orientation.js.map