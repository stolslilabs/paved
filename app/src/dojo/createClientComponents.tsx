import { overridableComponent } from "@dojoengine/recs";
import { ContractModels } from "./generated/contractModels";

export type ClientComponents = ReturnType<typeof createClientComponents>;

export function createClientComponents({
  contractComponents,
}: {
  contractComponents: ContractModels;
}) {
  return {
    ...contractComponents,
    Game: overridableComponent(contractComponents.Game),
    Player: overridableComponent(contractComponents.Player),
    Builder: overridableComponent(contractComponents.Builder),
    Tile: overridableComponent(contractComponents.Tile),
    Character: overridableComponent(contractComponents.Character),
  };
}
