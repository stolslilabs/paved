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
    Tile: overridableComponent(contractComponents.Tile),
    TilePosition: overridableComponent(contractComponents.TilePosition),
  };
}
