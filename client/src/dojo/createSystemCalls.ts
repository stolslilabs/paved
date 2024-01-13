import { Account, Call, Event, InvokeTransactionReceiptResponse, events, shortString } from 'starknet';
import { SetupNetworkResult } from "./setupNetwork";
import { ClientComponents } from "./createClientComponents";
import { InitializeSystemProps, CreateSystemProps, BuySystemProps, DrawSystemProps, DiscardSystemProps, BuildSystemProps } from "./types";

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

    const buy = async (props: BuySystemProps) => {
        try {
            await execute(props.signer, "play", "buy", [props.game_id]);
        } catch (e) {
            console.error(e);
        }
    }

    const draw = async (props: DrawSystemProps) => {
        try {
            await execute(props.signer, "play", "draw", [props.game_id]);
        } catch (e) {
            console.error(e);
        }
    }

    const discard = async (props: DiscardSystemProps) => {
        try {
            await execute(props.signer, "play", "discard", [props.game_id]);
        } catch (e) {
            console.error(e);
        }
    }

    const build = async (props: BuildSystemProps) => {
        const { role = 0, spot = 0 } = props;
        try {
            await execute(props.signer, "play", "build", [props.game_id, props.tile_id, props.orientation, props.x, props.y, role, spot]);
        } catch (e) {
            console.error(e);
        }
    }

    return {
        initialize,
        create,
        buy,
        draw,
        discard,
        build,
    };
}
