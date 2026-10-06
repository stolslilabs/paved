import type { Codecs, ContractName } from "./abis";
import { sameAddress, toHex, type DecodedEvent, type RawEvent } from "./codec";
import type { Deployment } from "./deployment";
import { gameContract, modeFromCode, type GameMode } from "./views";

/** What the reader needs from starknet.js's `RpcProvider`. */
export interface EventProvider {
  getEvents(filter: {
    address: string;
    from_block: { block_number: number };
    to_block: "latest";
    keys: string[][];
    chunk_size: number;
    continuation_token?: string;
  }): Promise<{ events: RawEvent[]; continuation_token?: string }>;
}

/** A game of a player, from its `GameSpawned` event and, once it ended, its `GameOver` event. */
export interface PlayerGame {
  mode: GameMode;
  gameId: number;
  startTime: number;
  /** Tournament of the spawn (Daily); 0 for Tutorial. */
  tournamentId: number;
  over: boolean;
  /** Final score; null while the game is active. */
  score: number | null;
  /** Tournament the game counted for (0 when it did not count), null while active. */
  countedTournamentId: number | null;
}

const CHUNK_SIZE = 100;

/** Reads the events of the native contracts from `deployed_block`, filtered by key on the node. */
export class EventReader {
  /** `GameSpawned` / `GameOver` of this client's own receipts, by contract: merged into the lists. */
  private readonly own = new Map<ContractName, DecodedEvent[]>();

  constructor(
    private readonly provider: EventProvider,
    private readonly deployment: Deployment,
    private readonly codecs: Codecs,
  ) {}

  /**
   * Every event `name` of `contract` whose keys after the selector match `keys`
   * (one entry per key; an empty entry matches any value), in chain order.
   */
  async read(contract: ContractName, name: string, keys: Array<string | number | null> = []): Promise<DecodedEvent[]> {
    const address = this.deployment.addresses[contract];
    if (!address) return [];
    const codec = this.codecs[contract];
    const filter = [[codec.eventSelector(name)], ...keys.map((k) => (k === null ? [] : [toHex(k)]))];
    const out: DecodedEvent[] = [];
    let continuation: string | undefined;
    do {
      const chunk = await this.provider.getEvents({
        address,
        from_block: { block_number: this.deployment.deployedBlock },
        to_block: "latest",
        keys: filter,
        chunk_size: CHUNK_SIZE,
        ...(continuation ? { continuation_token: continuation } : {}),
      });
      for (const raw of chunk.events) {
        const event = codec.decodeEvent(raw);
        if (event && event.name === name) out.push(event);
      }
      continuation = chunk.continuation_token;
    } while (continuation);
    return out;
  }

  /**
   * Keeps the list events of a receipt of this client, so a game it just spawned or ended is in
   * the lists even when the node's `latest` block lags behind the receipt.
   */
  remember(contract: ContractName, events: DecodedEvent[]): void {
    const kept = events.filter((e) => e.name === "GameSpawned" || e.name === "GameOver");
    if (kept.length) this.own.set(contract, [...(this.own.get(contract) ?? []), ...kept]);
  }

  /** `read` plus the remembered events of this client that match, without duplicates. */
  private async readWithOwn(contract: ContractName, name: string, playerId: string): Promise<DecodedEvent[]> {
    const read = await this.read(contract, name, [null, playerId]);
    const seen = new Set(read.map((e) => Number(e.fields.gameId)));
    const own = (this.own.get(contract) ?? []).filter(
      (e) => e.name === name && BigInt(e.fields.playerId as string) === BigInt(playerId) && !seen.has(Number(e.fields.gameId)),
    );
    return [...read, ...own];
  }

  /** The games of a player on one or both game contracts, newest first. */
  async playerGames(playerId: string, modes: GameMode[] = ["daily", "tutorial"]): Promise<PlayerGame[]> {
    const lists = await Promise.all(
      modes.map(async (mode) => {
        const contract = gameContract(mode);
        // GameSpawned keys: game_id, player_id. GameOver keys: game_id, player_id, tournament_id.
        const [spawned, over] = await Promise.all([
          this.readWithOwn(contract, "GameSpawned", playerId),
          this.readWithOwn(contract, "GameOver", playerId),
        ]);
        const ended = new Map(over.map((e) => [Number(e.fields.gameId), e]));
        return spawned.map((e): PlayerGame => {
          const gameId = Number(e.fields.gameId);
          const end = ended.get(gameId);
          const gameMode = modeFromCode(Number(e.fields.mode)) ?? mode;
          return {
            mode: gameMode,
            gameId,
            startTime: Number(e.fields.startTime),
            // Tutorial's GameSpawned carries the spawn time as tournament_id (its game duration is
            // 1 s in `TournamentImpl::compute_id`): no tournament, read as 0.
            tournamentId: gameMode === "tutorial" ? 0 : Number(e.fields.tournamentId),
            over: Boolean(end),
            score: end ? Number(end.fields.score) : null,
            countedTournamentId: end ? Number(end.fields.tournamentId) : null,
          };
        });
      }),
    );
    return lists.flat().sort((a, b) => b.startTime - a.startTime || b.gameId - a.gameId);
  }
}

/** The events a receipt holds from one contract, decoded with that contract's ABI. */
export function receiptEvents(
  receipt: { events?: RawEvent[] },
  codecs: Codecs,
  contract: ContractName,
  address: string,
): DecodedEvent[] {
  const out: DecodedEvent[] = [];
  for (const raw of receipt.events ?? []) {
    if (!raw.from_address || !sameAddress(raw.from_address, address)) continue;
    const event = codecs[contract].decodeEvent(raw);
    if (event) out.push(event);
  }
  return out;
}
