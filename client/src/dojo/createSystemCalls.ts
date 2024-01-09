import { Account, Call, Event, InvokeTransactionReceiptResponse, events, shortString } from 'starknet';
import { SetupNetworkResult } from "./setupNetwork";
import { ClientComponents } from "./createClientComponents";
import { InitializeSystemProps, CreateSystemProps, RevealSystemProps, BuildSystemProps } from "./types";

export type SystemCalls = ReturnType<typeof createSystemCalls>;

export function createSystemCalls(
    { execute }: SetupNetworkResult,
    { Game, Builder, Tile, TilePosition }: ClientComponents
) {
    const initialize = async (props: InitializeSystemProps) => {
        try {
            const tx = await execute(props.signer, "play", "initialize", []);
            // Parse event to get the game id.
            const receipt = (await props.signer.waitForTransaction(tx.transaction_hash, {
                retryInterval: 100,
              })) as InvokeTransactionReceiptResponse;
              const event = receipt.events.find((event: Event) => shortString.decodeShortString(event.data[0]) === 'Game');
              if (event) {
                const game_id = parseInt(event.data[2], 16);
                props.setGameId(game_id);
              }
        } catch (e) {
            console.error(e);
        }
    }

    const create = async (props: CreateSystemProps) => {
        try {
            await execute(props.signer, "play", "create", [props.game_id, props.name, props.order]);
        } catch (e) {
            console.error(e);
        }
    }

    const reveal = async (props: RevealSystemProps) => {
        try {
            await execute(props.signer, "play", "reveal", [props.game_id]);
        } catch (e) {
            console.error(e);
        }
    }

    const build = async (props: BuildSystemProps) => {
        try {
            await execute(props.signer, "play", "build", [props.game_id, props.tile_id, props.orientation, props.x, props.y]);
        } catch (e) {
            console.error(e);
        }
    }

    return {
        initialize,
        create,
        reveal,
        build,
    };
}
