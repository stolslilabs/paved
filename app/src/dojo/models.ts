import { ContractModels } from "./generated/contractModels";
import { Game } from "./game/models/game";
import { Tile } from "./game/models/tile";
import { Tournament } from "./game/models/tournament";
import { Builder } from "./game/models/builder";
import { Player } from "./game/models/player";

export type ClientModels = ReturnType<typeof models>;

export function models({ contractModels }: { contractModels: ContractModels }) {
  return {
    models: { ...contractModels },
    classes: {
      Game,
      Builder,
      Player,
      Tile,
      Tournament,
    },
  };
}
