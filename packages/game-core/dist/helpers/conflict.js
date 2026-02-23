// Source: https://github.com/stolslilabs/paved/blob/main/contracts/src/helpers/conflict.cairo
import { Spot, SpotType } from "../types/spot";
import { Orientation } from "../types/orientation";
import { Store } from "../store";
import { Role } from "../types/role";
export function checkFeatureIdle(gameId, tile, orientation, x, y, character, at, tiles) {
    const role = Role.from(character);
    const layout = tile.getLayout();
    const spot = Spot.from(at);
    const category = layout.getCategory(spot.value);
    if (spot.value === SpotType.None)
        return true;
    if (!role.isAllowed(category.value))
        return false;
    const conflict = new Conflict();
    const store = new Store(gameId, tiles);
    tile.orientation = Orientation.from(orientation);
    tile.x = x;
    tile.y = y;
    return !conflict.start(tile, spot, store);
}
export class Conflict {
    status = false;
    start(tile, at, store) {
        const visited = {};
        this.status = false;
        this.iter(tile, at, visited, store);
        return this.status;
    }
    iter(tile, at, visited, store) {
        const area = tile.area(at);
        const visitedKey = tile.getKey(area);
        if (visited[visitedKey]) {
            return;
        }
        visited[visitedKey] = true;
        const spot = tile.occupiedSpot;
        if (spot.value !== SpotType.None && tile.areConnected(at, spot)) {
            this.status = true;
            return;
        }
        const northOrientedMoves = tile.northOrientedMoves(at);
        for (const northOrientedMove of northOrientedMoves) {
            const move = northOrientedMove.rotate(tile.orientation.value);
            const [x, y] = tile.proxyCoordinates(move.direction);
            const neighbor = store.getTileByPosition(x, y);
            if (!neighbor) {
                continue;
            }
            this.iter(neighbor, move.spot, visited, store);
            if (this.status) {
                break;
            }
        }
    }
}
//# sourceMappingURL=conflict.js.map