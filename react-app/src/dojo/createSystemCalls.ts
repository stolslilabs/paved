import { Account } from "starknet";
import { ClientComponents } from "./createClientComponents";
import type { IWorld } from "./generated/generated";

export type SystemCalls = ReturnType<typeof createSystemCalls>;

export function createSystemCalls(
  { client }: { client: IWorld },
  contractComponents: any,
  {
    Game,
    Builder,
    Tile,
    TilePosition,
    Character,
    CharacterPosition,
  }: ClientComponents
) {
  const create_game = async (account: Account) => {
    console.log(account);
    // return await client.play.initialize({ account });
  };
  return {
    create_game,
  };
}
