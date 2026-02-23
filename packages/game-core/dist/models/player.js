function decodeShortString(felt) {
    const hex = BigInt(felt).toString(16);
    let str = "";
    for (let i = 0; i < hex.length; i += 2) {
        const charCode = parseInt(hex.substring(i, i + 2), 16);
        if (charCode === 0)
            break;
        str += String.fromCharCode(charCode);
    }
    return str;
}
export class Player {
    id;
    name;
    score;
    paved;
    master;
    constructor(player) {
        this.id = `0x${BigInt(player.id).toString(16)}`;
        this.name = decodeShortString(player.name);
        this.score = player.score;
        this.paved = player.paved;
        this.master = `0x${BigInt(player.master).toString(16)}`;
    }
    getShortName() {
        return this.name.length > 11 ? this.name.slice(0, 8) + "\u2026" : this.name;
    }
}
//# sourceMappingURL=player.js.map