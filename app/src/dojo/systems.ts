import type { IWorld } from "./generated/contractSystems";

import { toast } from "sonner";
import * as SystemTypes from "./types/systems";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { uuid } from "@latticexyz/utils";
import { ClientModels } from "./models";

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

  const initialize_host = async ({
    account,
    ...props
  }: SystemTypes.InitializeHost) => {
    try {
      const { transaction_hash } = await client.weekly.initialize({
        account,
        ...props,
      });

      notify(
        "Host has been initialized.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      console.error("Error initializing host:", error);
    }
  };

  const create_game = async ({ account, ...props }: SystemTypes.CreateGame) => {
    try {
      const { transaction_hash } = await client.weekly.spawn({
        account,
        ...props,
      });

      notify(
        "Game has been created.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      console.error("Error creating game:", error);
    }
  };

  const claim = async ({ account, ...props }: SystemTypes.Claim) => {
    try {
      const { transaction_hash } = await client.weekly.claim({
        account,
        ...props,
      });

      notify(
        "Tournament has been claimed.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      console.error("Error claiming tournament:", error);
    }
  };

  const sponsor = async ({ account, ...props }: SystemTypes.Sponsor) => {
    try {
      const { transaction_hash } = await client.weekly.sponsor({
        account,
        ...props,
      });

      notify(
        "Tournament has been sponsored.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      console.error("Error sponsoring tournament:", error);
    }
  };

  const initialize_manage = async ({
    account,
    ...props
  }: SystemTypes.InitializeManage) => {
    try {
      const { transaction_hash } = await client.weekly.initialize({
        account,
        ...props,
      });

      notify(
        "Manage has been initialized.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      console.error("Error initializing manage:", error);
    }
  };

  const create_player = async ({
    account,
    ...props
  }: SystemTypes.CreatePlayer) => {
    const playerKey = getEntityIdFromKeys([BigInt(account.address)]) as Entity;

    const playerId = uuid();
    clientModels.models.Player.addOverride(playerId, {
      entity: playerKey,
      value: {
        id: BigInt(account.address),
        name: BigInt(props.name),
        master: BigInt(props.master),
      },
    });

    try {
      const { transaction_hash } = await client.account.create({
        account,
        ...props,
      });

      notify(
        "Player has been created.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      console.error("Error creating player:", error);
      clientModels.models.Player.removeOverride(playerId);
    } finally {
      clientModels.models.Player.removeOverride(playerId);
    }
  };

  const initialize_play = async ({
    account,
    ...props
  }: SystemTypes.InitializePlay) => {
    try {
      const { transaction_hash } = await client.weekly.initialize({
        account,
        ...props,
      });

      notify(
        "Play has been initialized.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      console.error("Error initializing play:", error);
    }
  };

  const discard = async ({ account, ...props }: SystemTypes.Discard) => {
    try {
      const { transaction_hash } = await client.weekly.discard({
        account,
        ...props,
      });

      notify(
        "Tile has been discarded.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      console.error("Error discarding:", error);
    }
  };

  const surrender = async ({ account, ...props }: SystemTypes.Surrender) => {
    try {
      const { transaction_hash } = await client.weekly.surrender({
        account,
        ...props,
      });

      notify(
        "Game has been abandoned.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      console.error("Error surrendering:", error);
    }
  };

  const build = async ({ account, ...props }: SystemTypes.Build) => {
    const buidlerKey = getEntityIdFromKeys([
      BigInt(props.game_id),
      BigInt(props.tile_id),
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

    const characterId = uuid();
    if (props.role) {
      const characterKey = getEntityIdFromKeys([
        BigInt(props.game_id),
        BigInt(props.tile_id),
        BigInt(props.role),
      ]) as Entity;

      clientModels.models.Character.addOverride(characterId, {
        entity: characterKey,
        value: {
          game_id: props.game_id,
          player_id: BigInt(account.address),
          index: props.role,
          tile_id: props.tile_id,
          spot: props.spot,
        },
      });
    }

    try {
      const { transaction_hash } = await client.weekly.build({
        account,
        ...props,
      });

      notify(
        "Tile has been paved.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      clientModels.models.Tile.removeOverride(tileId);
      clientModels.models.Character.removeOverride(characterId);
      clientModels.models.Builder.removeOverride(builderId);
      console.error("Error building:", error);
    } finally {
      clientModels.models.Tile.removeOverride(tileId);
      clientModels.models.Character.removeOverride(characterId);
      clientModels.models.Builder.removeOverride(builderId);
    }
  };

  return {
    initialize_host,
    create_game,
    claim,
    sponsor,
    initialize_manage,
    create_player,
    initialize_play,
    discard,
    surrender,
    build,
  };
}
