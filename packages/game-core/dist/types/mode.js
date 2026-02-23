export var ModeType;
(function (ModeType) {
    ModeType["None"] = "none";
    ModeType["Daily"] = "daily";
    ModeType["Weekly"] = "weekly";
    ModeType["Tutorial"] = "tutorial";
})(ModeType || (ModeType = {}));
export class Mode {
    value;
    constructor(mode) {
        this.value = mode;
    }
    into() {
        return Object.values(ModeType).indexOf(this.value);
    }
    static from(index) {
        const mode = Object.values(ModeType)[index];
        return new Mode(mode);
    }
    duration() {
        switch (this.value) {
            case ModeType.Daily:
                return 86400;
            case ModeType.Weekly:
                return 604800;
            case ModeType.Tutorial:
                return 1;
            case ModeType.None:
                return 0;
        }
    }
    offset() {
        switch (this.value) {
            case ModeType.Daily:
                return 19855;
            case ModeType.Weekly:
                return 2835;
            case ModeType.Tutorial:
                return 0;
            case ModeType.None:
                return 0;
        }
    }
    price() {
        switch (this.value) {
            case ModeType.Daily:
                return BigInt(0);
            case ModeType.Weekly:
                return BigInt("1000000000000000000");
            case ModeType.Tutorial:
                return BigInt(0);
            case ModeType.None:
                return BigInt(0);
        }
    }
    count() {
        switch (this.value) {
            case ModeType.Daily:
                return 38;
            case ModeType.Weekly:
                return 72;
            case ModeType.Tutorial:
                return 9;
            case ModeType.None:
                return 0;
        }
    }
}
//# sourceMappingURL=mode.js.map