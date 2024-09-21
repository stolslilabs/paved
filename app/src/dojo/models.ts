import { ContractComponents } from "./bindings/models.gen";
import { Game } from "./game/models/game";
import { Tile } from "./game/models/tile";
import { Tournament } from "./game/models/tournament";
import { Builder } from "./game/models/builder";
import { Player } from "./game/models/player";
import { overridableComponent } from "@dojoengine/recs";
import { Character } from "./game/models/character";

export type ClientModels = ReturnType<typeof models>;

export function models({
  contractModels,
}: {
  contractModels: ContractComponents;
}) {
  return {
    models: {
      ...contractModels,
      Game: overridableComponent(contractModels.Game),
      Player: overridableComponent(contractModels.Player),
      Builder: overridableComponent(contractModels.Builder),
      Tile: overridableComponent(contractModels.Tile),
      Character: overridableComponent(contractModels.Char),
    },
    classes: {
      Game,
      Builder,
      Player,
      Character,
      Tile,
      Tournament,
    },
  };
}
