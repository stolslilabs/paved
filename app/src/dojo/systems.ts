import type { IWorld } from "./bindings/contracts.gen";

import { toast } from "sonner";
import { getEntityIdFromKeys, shortenHex } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { uuid } from "@latticexyz/utils";
import { ClientModels } from "./models";
import { Mode, ModeType } from "./game/types/mode";
import { Account } from "starknet";

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

  const getContract = (mode: ModeType): any => {
    switch (mode) {
      case ModeType.Daily:
        return client.Daily;
      case ModeType.Weekly:
        return client.Weekly;
      case ModeType.Tutorial:
        return client.Tutorial;
      case ModeType.Duel:
        return client.Duel;
      default:
        return client.Daily;
    }
  };

  const notify = (message: string, transaction: any) => {
    if (transaction.execution_status != "REVERTED") {
      toast.success(message, {
        description: shortenHex(transaction.transaction_hash),
        action: {
          label: "View",
          onClick: () =>
            window.open(
              `https://worlds.dev/networks/slot/worlds/paved/txs/${transaction.transaction_hash}`,
            ),
        },
      });
    } else {
      toast.error(extractedMessage(transaction.revert_reason));
    }
  };

  const create_player = async ({ account, ...props }: any) => {
    try {
      const { transaction_hash } = await client.Account.create({
        account,
        ...props,
      });

      notify(
        "Player has been created.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error: any) {
      toast.error(extractedMessage(error.message));
    }
  };

  type CreateGameProps = {
    account: Account;
    mode: Mode;
  }

  const create_game = async ({ account, mode, ...props }: CreateGameProps) => {
    const contract = getContract(mode?.value as ModeType);
    try {
      const { transaction_hash } = await contract.spawn({
        account,
        ...props,
      });

      mode?.value === ModeType.Tutorial
        ? await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        })
        : notify(
          "Game has been created.",
          await account.waitForTransaction(transaction_hash, {
            retryInterval: 100,
          }),
        );
    } catch (error: any) {
      console.log(error);
      toast.error(extractedMessage(error.message));
    }
  };

  const claim = async ({ account, mode, ...props }: any) => {
    try {
      const contract = getContract(mode?.value as ModeType);
      const { transaction_hash } = await contract.claim({
        account,
        ...props,
      });
      notify(
        "Tournament has been claimed.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error: any) {
      toast.error(extractedMessage(error.message));
    }
  };

  const sponsor = async ({ account, mode, ...props }: any) => {
    try {
      const contract = getContract(mode?.value as ModeType);
      const { transaction_hash } = await contract.sponsor({
        account,
        ...props,
      });
      notify(
        "Tournament has been sponsored.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error: any) {
      toast.error(extractedMessage(error.message));
    }
  };

  const discard = async ({ account, mode, ...props }: any) => {
    try {
      const contract = getContract(mode?.value as ModeType);
      const { transaction_hash } = await contract.discard({
        account,
        ...props,
      });
      notify(
        "Tile has been discarded.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error: any) {
      toast.error(extractedMessage(error.message));
    }
  };

  const surrender = async ({ account, mode, ...props }: any) => {
    try {
      const contract = getContract(mode?.value as ModeType);
      const { transaction_hash } = await contract.surrender({
        account,
        ...props,
      });
      notify(
        "Game has been abandoned.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
    } catch (error: any) {
      toast.error(extractedMessage(error.message));
    }
  };

  const build = async ({ account, mode, ...props }: any) => {
    const buidlerKey = getEntityIdFromKeys([
      BigInt(props.game_id),
      BigInt(account?.address),
    ]) as Entity;

    const builderId = uuid();
    clientModels.models.Builder.addOverride(builderId, {
      entity: buidlerKey,
      value: {
        game_id: props.game_id,
        player_id: BigInt(account?.address),
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
        player_id: BigInt(account?.address),
        orientation: props.orientation,
        x: props.x,
        y: props.y,
        occupied_spot: props.spot,
      },
    });

    const contractMap = {
      [ModeType.Daily]: client.Daily,
      [ModeType.Weekly]: client.Weekly,
      [ModeType.Tutorial]: client.Tutorial,
      [ModeType.Duel]: client.Duel,
    };

    try {
      const contract =
        contractMap[mode?.value as keyof typeof contractMap] ?? client.Daily;
      const { transaction_hash } = await contract.build({
        account,
        ...props,
      });
      notify(
        "Tile has been paved.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
      // Sleep 5 seconds for indexer to index
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } catch (error: any) {
      clientModels.models.Tile.removeOverride(tileId);
      clientModels.models.Builder.removeOverride(builderId);
      toast.error(extractedMessage(error.message));
    } finally {
      clientModels.models.Tile.removeOverride(tileId);
      clientModels.models.Builder.removeOverride(builderId);
    }
  };

  const delete_duel_lobby = async ({ account, mode, ...props }: any) => {
    try {
      const contract = getContract(mode?.value as ModeType);
      const { transaction_hash } = await contract.remove({
        account,
        ...props,
      });
      notify(
        "Duel lobby has been quit.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
      return true
    } catch (error: any) {
      toast.error(extractedMessage(error.message));
    }
  };

  const ready_duel_lobby = async ({ account, mode, ...props }: any) => {
    try {
      const contract = getContract(mode?.value as ModeType);
      const { transaction_hash } = await contract.ready({
        account,
        ...props,
      });
      notify(
        props.status ? "You are readied." : "You are unreadied.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
      return true
    } catch (error: any) {
      toast.error(extractedMessage(error.message));
    }
  };

  const join_duel_lobby = async ({ account, mode, ...props }: any) => {
    try {
      const contract = getContract(mode?.value as ModeType);
      const { transaction_hash } = await contract.join({
        account,
        ...props,
      });
      notify(
        "You joined the lobby.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
      return true
    } catch (error: any) {
      toast.error(extractedMessage(error.message));
    }
  };

  const leave_duel_lobby = async ({ account, mode, ...props }: any) => {
    try {
      const contract = getContract(mode?.value as ModeType);
      const { transaction_hash } = await contract.leave({
        account,
        ...props,
      });
      notify(
        "You left the lobby.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
      return true
    } catch (error: any) {
      toast.error(extractedMessage(error.message));
    }
  };

  const start_duel_lobby = async ({ account, mode, ...props }: any) => {
    try {
      const contract = getContract(mode?.value as ModeType);
      const { transaction_hash } = await contract.start({
        account,
        ...props,
      });
      notify(
        "Duel has been started.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
      return true
    } catch (error: any) {
      toast.error(extractedMessage(error.message));
    }
  };

  const claim_duel_prize = async ({ account, mode, ...props }: any) => {
    try {
      const contract = getContract(mode?.value as ModeType);
      const { transaction_hash } = await contract.claim({
        account,
        ...props,
      });
      notify(
        "Prize has been claimed.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
      return true
    } catch (error: any) {
      toast.error(extractedMessage(error.message));
    }
  };

  const kick_duel_lobby = async ({ account, mode, ...props }: any) => {
    try {
      const contract = getContract(mode?.value as ModeType);
      const { transaction_hash } = await contract.kick({
        account,
        ...props,
      });
      notify(
        "Player has been kicked.",
        await account.waitForTransaction(transaction_hash, {
          retryInterval: 100,
        }),
      );
      return true
    } catch (error: any) {
      toast.error(extractedMessage(error.message));
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
    delete_duel_lobby,
    ready_duel_lobby,
    join_duel_lobby,
    leave_duel_lobby,
    start_duel_lobby,
    kick_duel_lobby,
    claim_duel_prize
  };
}
