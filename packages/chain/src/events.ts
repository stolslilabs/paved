import { LOBBY_ABI, type Codecs, type ContractName } from "./abis";
import { AbiCodec, sameAddress, toHex, type DecodedEvent, type RawEvent } from "./codec";
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
  /** Tournament of the spawn (Daily); 0 for Tutorial (#205). */
  tournamentId: number;
  over: boolean;
  /** Final score; null while the game is active. */
  score: number | null;
  /** Tournament the game counted for (0 when it did not count), null while active. */
  countedTournamentId: number | null;
}

/** What a sponsor put into a day's prize and took back, from the `Sponsored` and `Reclaimed` events. */
export interface Sponsorship {
  sponsored: bigint;
  reclaimed: bigint;
  /** `sponsored - reclaimed`: what `claim(day, 0)` pays the sponsor on a day nobody ranked in. */
  reclaimable: bigint;
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
    /** Decodes the events Daily emits from `Lobby`'s ABI (`Reclaimed`). */
    private readonly lobby: AbiCodec = new AbiCodec(LOBBY_ABI),
  ) {}

  /**
   * Every event `name` of `contract` whose keys after the selector match `keys`
   * (one entry per key; an empty entry matches any value), in chain order.
   */
  async read(contract: ContractName, name: string, keys: Array<string | number | null> = []): Promise<DecodedEvent[]> {
    return this.readAt(this.deployment.addresses[contract], this.codecs[contract], name, keys);
  }

  private async readAt(address: string, codec: AbiCodec, name: string, keys: Array<string | number | null>): Promise<DecodedEvent[]> {
    if (!address) return [];
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
   * What `sponsor` put into the day `tournamentId` (`Daily.Sponsored`) and took back (`Lobby.Reclaimed`, emitted from
   * Daily). The contract keeps no view of it, and `tournament(id).prize` stays at the historical total after a
   * reclaim, so the events are the only record of what went back.
   */
  async sponsorship(tournamentId: number, sponsor: string): Promise<Sponsorship> {
    const [sponsoredEvents, reclaimedEvents] = await Promise.all([
      this.read("Daily", "Sponsored", [tournamentId]),
      this.readAt(this.deployment.addresses.Daily, this.lobby, "Reclaimed", [tournamentId, sponsor]),
    ]);
    const sponsored = sponsoredEvents
      .filter((e) => BigInt(e.fields.sponsor as string) === BigInt(sponsor))
      .reduce((sum, e) => sum + BigInt(e.fields.amount as string | bigint), 0n);
    const reclaimed = reclaimedEvents.reduce((sum, e) => sum + BigInt(e.fields.amount as string | bigint), 0n);
    return { sponsored, reclaimed, reclaimable: sponsored > reclaimed ? sponsored - reclaimed : 0n };
  }

  /**
   * The days `sponsor` put something into, newest first (from `Sponsored`, whose sponsor is event data, not a key: the
   * node cannot filter on it, so every day's events are read). A day may hold a part to reclaim.
   */
  async sponsoredDays(sponsor: string): Promise<number[]> {
    const events = await this.read("Daily", "Sponsored");
    const days = new Set(events.filter((e) => BigInt(e.fields.sponsor as string) === BigInt(sponsor)).map((e) => Number(e.fields.tournamentId)));
    return [...days].sort((a, b) => b - a);
  }

  /** What went back to the sponsors of the day `tournamentId` in all, from its `Reclaimed` events. */
  async reclaimedTotal(tournamentId: number): Promise<bigint> {
    const events = await this.readAt(this.deployment.addresses.Daily, this.lobby, "Reclaimed", [tournamentId]);
    return events.reduce((sum, e) => sum + BigInt(e.fields.amount as string | bigint), 0n);
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
            // 0 for Tutorial, which has no tournament (#205).
            tournamentId: Number(e.fields.tournamentId),
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
