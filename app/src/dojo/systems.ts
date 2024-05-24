import type { IWorld } from "./generated/contractSystems";

import { toast } from "sonner";
import * as SystemTypes from "./types/systems";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { uuid } from "@latticexyz/utils";
import { ClientModels } from "./models";
import { Mode, ModeType } from "./game/types/mode";

export type SystemCalls = ReturnType<typeof systems>;

export function systems({
  client,
  clientModels,
}: {
  client: IWorld;
  clientModels: ClientModels;
}) {
  const extractedMessage = (message: string) => {
    return message.match(/\('([^']+)'\)/)?.[1];
  };

  const notify = (message: string, transaction: any) => {
    if (transaction.execution_status != "REVERTED") {
      toast.success(message);
    } else {
      toast.error(extractedMessage(transaction.revert_reason));
    }
  };

  const create_player = async ({
    account,
    ...props
  }: SystemTypes.CreatePlayer) => {
    try {
      const { transaction_hash } = await client.account.create({
        account,
        ...props,
      });

      notify(
        "Player has been created.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        })
      );
    } catch (error) {
      console.error("Error creating player:", error);
    }
  };

  const create_game = async ({
    account,
    mode,
    ...props
  }: SystemTypes.CreateGame) => {
    const contract =
      mode?.value === ModeType.Daily ? client.daily : client.weekly;
    try {
      const { transaction_hash } = await contract.spawn({
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

  const claim = async ({ account, mode, ...props }: SystemTypes.Claim) => {
    try {
      const contract =
        mode?.value === ModeType.Daily ? client.daily : client.weekly;
      const { transaction_hash } = await contract.claim({
        account,
        ...props,
      });
      notify(
        "Tournament has been claimed.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        })
      );
    } catch (error) {
      console.error("Error claiming tournament:", error);
    }
  };

  const sponsor = async ({ account, mode, ...props }: SystemTypes.Sponsor) => {
    try {
      const contract =
        mode?.value === ModeType.Daily ? client.daily : client.weekly;
      const { transaction_hash } = await contract.sponsor({
        account,
        ...props,
      });
      notify(
        "Tournament has been sponsored.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        })
      );
    } catch (error) {
      console.error("Error sponsoring tournament:", error);
    }
  };

  const discard = async ({ account, mode, ...props }: SystemTypes.Discard) => {
    try {
      const contract =
        mode?.value === ModeType.Daily ? client.daily : client.weekly;
      const { transaction_hash } = await contract.discard({
        account,
        ...props,
      });
      notify(
        "Tile has been discarded.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        })
      );
    } catch (error) {
      console.error("Error discarding:", error);
    }
  };

  const surrender = async ({
    account,
    mode,
    ...props
  }: SystemTypes.Surrender) => {
    try {
      const contract =
        mode?.value === ModeType.Daily ? client.daily : client.weekly;
      const { transaction_hash } = await contract.surrender({
        account,
        ...props,
      });
      notify(
        "Game has been abandoned.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        })
      );
    } catch (error) {
      console.error("Error surrendering:", error);
    }
  };

  const build = async ({ account, mode, ...props }: SystemTypes.Build) => {
    const buidlerKey = getEntityIdFromKeys([
      BigInt(props.game_id),
      BigInt(account.address),
    ]) as Entity;

    const builderId = uuid();
    clientModels.models.Builder.addOverride(builderId, {
      entity: buidlerKey,
      value: {
        game_id: props.game_id,
        player_id: BigInt(account.address),
        tile_id: 0,
      },
    });

    const tileKey = getEntityIdFromKeys([
      BigInt(props.game_id),
      BigInt(props.tile_id),
    ]) as Entity;

    const tileId = uuid();
    clientModels.models.Tile.addOverride(tileId, {
      entity: tileKey,
      value: {
        game_id: props.game_id,
        id: props.tile_id,
        player_id: BigInt(account.address),
        orientation: props.orientation,
        x: props.x,
        y: props.y,
        occupied_spot: props.spot,
      },
    });

    try {
      const contract =
        mode?.value === ModeType.Daily ? client.daily : client.weekly;
      const { transaction_hash } = await contract.build({
        account,
        ...props,
      });
      notify(
        "Tile has been paved.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        })
      );
      // Sleep 5 seconds for indexer to index
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } catch (error) {
      clientModels.models.Tile.removeOverride(tileId);
      clientModels.models.Builder.removeOverride(builderId);
      console.error("Error building:", error);
    } finally {
      clientModels.models.Tile.removeOverride(tileId);
      clientModels.models.Builder.removeOverride(builderId);
    }
  };

  return {
    create_player,
    create_game,
    claim,
    sponsor,
    discard,
    surrender,
    build,
  };
}
