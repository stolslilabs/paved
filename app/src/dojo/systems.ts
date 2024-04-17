import type { IWorld } from "./generated/contractSystems";

import { toast } from "sonner";
import * as SystemTypes from "./types/systems";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { uuid } from "@latticexyz/utils";
import { ClientComponents } from "./createClientComponents";

export type SystemCalls = ReturnType<typeof systems>;

export function systems({
  client,
  clientComponents,
}: {
  client: IWorld;
  clientComponents: ClientComponents;
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

  const create_game = async ({ account, ...props }: SystemTypes.CreateGame) => {
    try {
      const { transaction_hash } = await client.host.create({
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

  const rename_game = async ({ account, ...props }: SystemTypes.RenameGame) => {
    try {
      const { transaction_hash } = await client.host.rename({
        account,
        ...props,
      });

      notify(
        "Game has been renamed.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      console.error("Error renaming game:", error);
    }
  };

  const update_game = async ({ account, ...props }: SystemTypes.UpdateGame) => {
    try {
      const { transaction_hash } = await client.host.update({
        account,
        ...props,
      });

      notify(
        "Game has been updated.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      console.error("Error updating game:", error);
    }
  };

  const join_game = async ({ account, ...props }: SystemTypes.JoinGame) => {
    try {
      const { transaction_hash } = await client.host.join({
        account,
        ...props,
      });

      notify(
        "Game has been joined.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      console.error("Error joining game:", error);
    }
  };

  const ready_game = async ({ account, ...props }: SystemTypes.ReadyGame) => {
    try {
      const { transaction_hash } = await client.host.ready({
        account,
        ...props,
      });

      notify(
        "Builder is ready.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      console.error("Error being ready:", error);
    }
  };

  const transfer_game = async ({
    account,
    ...props
  }: SystemTypes.TransferGame) => {
    try {
      const { transaction_hash } = await client.host.transfer({
        account,
        ...props,
      });

      notify(
        "Game has been transferred.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      console.error("Error transferring game:", error);
    }
  };

  const leave_game = async ({ account, ...props }: SystemTypes.LeaveGame) => {
    try {
      const { transaction_hash } = await client.host.leave({
        account,
        ...props,
      });

      notify(
        "Game has been left.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      console.error("Error leaving game:", error);
    }
  };

  const kick_game = async ({ account, ...props }: SystemTypes.KickGame) => {
    try {
      const { transaction_hash } = await client.host.kick({
        account,
        ...props,
      });

      notify(
        "Builder has been kicked.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      console.error("Error kicking builder:", error);
    }
  };

  const delete_game = async ({ account, ...props }: SystemTypes.DeleteGame) => {
    try {
      const { transaction_hash } = await client.host.remove({
        account,
        ...props,
      });

      notify(
        "Game has been deleted.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      console.error("Error deleting game:", error);
    }
  };

  const start_game = async ({ account, ...props }: SystemTypes.StartGame) => {
    try {
      const { transaction_hash } = await client.host.start({
        account,
        ...props,
      });

      notify(
        "Game has been started.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      console.error("Error starting game:", error);
    }
  };

  const claim_tournament = async ({
    account,
    ...props
  }: SystemTypes.ClaimTournament) => {
    try {
      const { transaction_hash } = await client.host.claim({
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

  const create_player = async ({
    account,
    ...props
  }: SystemTypes.CreatePlayer) => {
    try {
      const { transaction_hash } = await client.manage.create({
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
    }
  };

  const rename_player = async ({
    account,
    ...props
  }: SystemTypes.RenamePlayer) => {
    try {
      const { transaction_hash } = await client.manage.rename({
        account,
        ...props,
      });

      notify(
        "Player has been renamed.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      console.error("Error renaming player:", error);
    }
  };

  const reorder_player = async ({
    account,
    ...props
  }: SystemTypes.ReorderPlayer) => {
    try {
      const { transaction_hash } = await client.manage.reorder({
        account,
        ...props,
      });

      notify(
        "Player has been reordered.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      console.error("Error reordering player:", error);
    }
  };

  const buy = async ({ account, ...props }: SystemTypes.Buy) => {
    try {
      const { transaction_hash } = await client.manage.buy({
        account,
        ...props,
      });

      notify(
        "Bought.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      console.error("Error buying:", error);
    }
  };

  const claim = async ({ account, ...props }: SystemTypes.Claim) => {
    try {
      const { transaction_hash } = await client.manage.claim({
        account,
        ...props,
      });

      notify(
        "Claimed.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      console.error("Error claiming:", error);
    }
  };

  const draw = async ({ account, ...props }: SystemTypes.Draw) => {
    try {
      const { transaction_hash } = await client.play.draw({
        account,
        ...props,
      });

      notify(
        "Tile has been revealed.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error) {
      console.error("Error drawing:", error);
    }
  };

  const discard = async ({ account, ...props }: SystemTypes.Discard) => {
    try {
      const { transaction_hash } = await client.play.discard({
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
      const { transaction_hash } = await client.play.surrender({
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
    const entityId = getEntityIdFromKeys([
      BigInt(props.game_id),
      BigInt(props.tile_id),
    ]) as Entity;

    const tileId = uuid();
    clientComponents.Tile.addOverride(tileId, {
      entity: entityId,
      value: {
        game_id: props.game_id,
        id: props.tile_id,
        player_id: BigInt(account.address),
        plan: 0,
        orientation: props.orientation,
        x: props.x,
        y: props.y,
        occupied_spot: props.spot,
      },
    });

    const tilePositionId = uuid();

    clientComponents.TilePosition.addOverride(tilePositionId, {
      entity: getEntityIdFromKeys([
        BigInt(props.game_id),
        BigInt(props.x),
        BigInt(props.y),
      ]) as Entity,
      value: {
        game_id: props.game_id,
        x: props.x,
        y: props.y,
        tile_id: props.tile_id,
      },
    });

    try {
      const { transaction_hash } = await client.play.build({
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
      console.error("Error building:", error);
      clientComponents.Tile.removeOverride(tileId);
      clientComponents.TilePosition.removeOverride(tilePositionId);
    } finally {
      clientComponents.Tile.removeOverride(tileId);
      clientComponents.TilePosition.removeOverride(tilePositionId);
    }
  };

  return {
    create_game,
    rename_game,
    update_game,
    join_game,
    ready_game,
    transfer_game,
    leave_game,
    kick_game,
    delete_game,
    start_game,
    claim_tournament,
    create_player,
    rename_player,
    reorder_player,
    buy,
    claim,
    draw,
    discard,
    surrender,
    build,
  };
}
