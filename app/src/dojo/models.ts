import { ContractModels } from "./generated/contractModels";
import { Game } from "./game/models/game";
import { Tile } from "./game/models/tile";

export type ClientModels = ReturnType<typeof models>;

export function models({ contractModels }: { contractModels: any }) {
  return {
    models: { ...contractModels },
    classes: {
      Game,
      Tile,
    },
  };
}
