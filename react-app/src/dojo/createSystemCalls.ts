import { Account } from "starknet";
import { ClientComponents } from "./createClientComponents";
import type { IWorld } from "./generated/generated";

import { toast } from "sonner";
import { CreateGame } from "./generated/types";

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
  const extractedMessage = (message: string) => {
    return message.match(/\('([^']+)'\)/)?.[1];
  };

  const notify = (message: string, transaction: any) => {
    toast(
      transaction.execution_status != "REVERTED"
        ? message
        : extractedMessage(transaction.revert_reason)
    );
  };

  const create_game = async ({ account, ...props }: CreateGame) => {
    try {
      const { transaction_hash } = await client.play.create({
        account,
        ...props,
      });

      notify(
        "Game has been created.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        })
      );
    } catch (error) {
      console.error("Error creating game:", error);
    }
  };
  return {
    create_game,
  };
}
