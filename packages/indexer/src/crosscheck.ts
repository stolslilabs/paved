// The cross-check against the `tournament` view (docs/architecture/indexer.md, D-P6-5): for each closed day not checked
// yet, one read-only `Daily.tournament(id)` call at the served block, compared with the prize slots replayed from the
// events. A difference is an indexer bug (a missed event, a wrong order): it is reported in `GET /v1/head`
// (`checks.last_mismatch`), never acted on, and halts nothing. The view is read at a block the indexer has applied, so no
// mismatch can come from the indexer lagging; a day is closed when the served block's time is at or past its end, after
// which the slots cannot move (counting `GameOver`s stop at the day's end).
import { hash } from "starknet";
import type { Mismatch } from "./api.ts";
import type { Chain, Header } from "./chain.ts";
import { padded } from "./events.ts";
import { slotView, type Queries } from "./queries.ts";

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
  private readonly log: (message: string) => void;

  constructor(chain: Chain, queries: Queries, log: (message: string) => void = () => {}) {
    this.chain = chain;
    this.queries = queries;
    this.log = log;
  }

  /** The tables went back: what was compared may have changed. */
  reset() {
    this.checked.clear();
    this.lastMismatch = null;
  }

  /** Compares every closed day of the served block that is not checked yet. A failed call is retried at the next block. */
  async run(served: Header): Promise<void> {
    for (const id of this.queries.closedTournaments(served.number, served.timestamp)) {
      if (this.checked.has(id)) continue;
      let felts: bigint[];
      try {
        felts = await this.chain.view("daily", `0x${SELECTOR}`, [`0x${id.toString(16)}`], served.hash);
      } catch (error) {
        this.log(`cross-check of tournament ${id} failed: ${(error as Error).message}`);
        return;
      }
      const view = [0, 1, 2].map((rank) => ({
        player_id: padded(felts[FIRST_TOP + rank * 3] ?? 0n),
        score: Number(felts[FIRST_TOP + rank * 3 + 1] ?? 0n),
      }));
      const indexed = this.queries.slots(served.number, id).map(slotView);
      this.checked.add(id);
      if (JSON.stringify(view) !== JSON.stringify(indexed)) {
        this.lastMismatch = { tournament_id: id, head_number: served.number, view, indexed };
        this.log(`cross-check: tournament ${id} differs from the view`);
      }
    }
  }
}
