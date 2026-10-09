// The cross-check against the `tournament` view (docs/architecture/indexer.md, D-P6-5): for each closed day not checked
// yet, one read-only `Daily.tournament(id)` call at the served block, compared with the prize slots replayed from the
// events. A difference is an indexer bug (a missed event, a wrong order): it is reported in `GET /v1/head`
// (`checks.last_mismatch`), never acted on, and halts nothing. The view is read at a block the indexer has applied, so no
// mismatch can come from the indexer lagging; a day is closed when the served block's time is at or past its end, after
// which the slots cannot move (counting `GameOver`s stop at the day's end).
//
// The same read is the Podium (quests.md, "On the Podium", P-22/O-37): the players the view names in its three slots are
// recorded in the `podium` table for that day, credited to the On the Podium achievement. They come from the view, not from
// the replay of the events, so a mismatch does not change who is credited; and only from a closed day (never early).
import { hash } from "starknet";
import { TOURNAMENT_DURATION, type Mismatch } from "./api.ts";
import type { Chain, Header } from "./chain.ts";
import { padded } from "./events.ts";
import { Queries, slotView } from "./queries.ts";
import type { Store } from "./store.ts";

const SELECTOR = BigInt(hash.getSelectorFromName("tournament")).toString(16);

// TournamentView (contracts/abis/Daily.json): id, start_time, end_time, over, prize (u256: two felts), then per rank
// player_id, score, claimed.
const FIRST_TOP = 6;

export class CrossCheck {
  lastMismatch: Mismatch | null = null;
  /** Days compared since the process started (or the last rewind). */
  readonly checked = new Set<number>();
  private readonly chain: Chain;
  private readonly queries: Queries;
  private readonly store: Store;
  private readonly log: (message: string) => void;

  /** `source`: the store, or the queries over it (the client's tests build it that way; the podium needs the store). */
  constructor(chain: Chain, source: Store | Queries, log: (message: string) => void = () => {}) {
    this.chain = chain;
    this.queries = source instanceof Queries ? source : new Queries(source);
    this.store = this.queries.store;
    this.log = log;
  }

  /** The tables went back: what was compared may have changed. */
  reset() {
    this.checked.clear();
    this.lastMismatch = null;
  }

  /** Compares every closed day of the served block that is not checked yet. A failed call throws, nothing recorded for that day; the indexer logs it and calls again at its next step. */
  async run(served: Header): Promise<void> {
    for (const id of this.queries.closedTournaments(served.number, served.timestamp)) {
      if (this.checked.has(id)) continue;
      let felts: bigint[];
      try {
        felts = await this.chain.view("daily", `0x${SELECTOR}`, [`0x${id.toString(16)}`], served.hash);
      } catch (error) {
        throw new Error(`cross-check of tournament ${id} failed: ${(error as Error).message}`);
      }
      const view = [0, 1, 2].map((rank) => ({
        player_id: padded(felts[FIRST_TOP + rank * 3] ?? 0n),
        score: Number(felts[FIRST_TOP + rank * 3 + 1] ?? 0n),
      }));
      const indexed = this.queries.slots(served.number, id).map(slotView);
      this.store.recordPodium(
        id,
        (id + 1) * TOURNAMENT_DURATION,
        view.flatMap((slot, index) =>
          BigInt(slot.player_id) === 0n ? [] : [{ playerId: slot.player_id, rank: index + 1 }],
        ),
        served,
      );
      this.checked.add(id);
      if (JSON.stringify(view) !== JSON.stringify(indexed)) {
        this.lastMismatch = { tournament_id: id, head_number: served.number, view, indexed };
        this.log(`cross-check: tournament ${id} differs from the view`);
      }
    }
  }
}
