import { ModeType } from "@paved/game-core";
function getContractNamespace(mode) {
    switch (mode) {
        case ModeType.Daily: return "Daily";
        case ModeType.Weekly: return "Weekly";
        case ModeType.Tutorial: return "Tutorial";
        default: return "Daily";
    }
}
export function createSystems(_config) {
    return {
        async createPlayer(params) {
            // Account.create(name, master)
            // Placeholder: actual implementation calls the Account contract
            console.log("createPlayer", params.name);
            return { transactionHash: "0x0" };
        },
        async createGame(params) {
            const ns = getContractNamespace(params.mode);
            console.log(`${ns}.spawn()`, params.account.address);
            return { transactionHash: "0x0" };
        },
        async build(params) {
            const ns = getContractNamespace(params.mode);
            console.log(`${ns}.build()`, {
                gameId: params.gameId,
                orientation: params.orientation,
                x: params.x,
                y: params.y,
                role: params.role,
                spot: params.spot,
            });
            return { transactionHash: "0x0" };
        },
        async discard(params) {
            const ns = getContractNamespace(params.mode);
            console.log(`${ns}.discard()`, params.gameId);
            return { transactionHash: "0x0" };
        },
        async surrender(params) {
            const ns = getContractNamespace(params.mode);
            console.log(`${ns}.surrender()`, params.gameId);
            return { transactionHash: "0x0" };
        },
        async claim(params) {
            const ns = getContractNamespace(params.mode);
            console.log(`${ns}.claim()`, params.tournamentId, params.rank);
            return { transactionHash: "0x0" };
        },
        async sponsor(params) {
            console.log("Daily.sponsor()", params.amount.toString());
            return { transactionHash: "0x0" };
        },
    };
}
//# sourceMappingURL=contracts.js.map