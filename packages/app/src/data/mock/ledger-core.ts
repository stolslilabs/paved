import type { DecodedEvent, WriteResult } from "@paved/chain";
import { addressKey } from "../keys";
import { MOCK_KEY, MOCK_LATENCY_MS, MOCK_STARTING_BALANCES, type TokenBalances, type StoredPlayer, type StoredState, fresh, newPlayer, parse, type MockLedgerOptions, type MockLock, mockLock } from "./ledger-state";

/** The mock ledger's state: its fields, the store's reads and writes (`sync`, `save`), a write's commit, the clock and the receipts' events. One link of `MockLedger`'s chain (`ledger.ts`). */
export abstract class LedgerCore {
  protected state: StoredState;

  protected readonly latency: number;

  protected readonly starting: Readonly<TokenBalances>;

  protected readonly lock: MockLock;

  constructor(protected readonly options: MockLedgerOptions) {
    this.state = this.load();
    this.latency = options.latencyMs ?? MOCK_LATENCY_MS;
    this.starting = options.starting ?? MOCK_STARTING_BALANCES;
    this.lock = options.lock ?? mockLock;
  }

  /**
   * The state as stored now: another tab (or another ledger on the same store) may have written since this one loaded. Every
   * read and every write starts from it, so no write stores a stale copy over another's. Without a store the state is this
   * ledger's own.
   */
  protected sync(): void {
    try {
      const stored = parse(this.options.store()?.getItem(MOCK_KEY) ?? null);
      if (stored) this.state = stored;
    } catch {
      // Storage refused: keep the state of the visit.
    }
  }

  private load(): StoredState {
    try {
      return parse(this.options.store()?.getItem(MOCK_KEY) ?? null) ?? fresh();
    } catch {
      return fresh();
    }
  }

  protected save(): void {
    try {
      this.options.store()?.setItem(MOCK_KEY, JSON.stringify(this.state));
    } catch {
      // Storage refused (private mode, quota): the state lives for the visit.
    }
  }

  /** A player's state for a read; a player not seen yet reads the start, and is not stored until a write. */
  protected peek(playerId: string): StoredPlayer {
    return this.state.players[addressKey(playerId)] ?? newPlayer(this.starting);
  }

  /**
   * One write: `change` works on a copy of the player and returns the receipt's events; a throw leaves the ledger as it was
   * (a revert), else the copy is kept and stored.
   */
  protected write(account: string, change: (player: StoredPlayer, hash: string) => DecodedEvent[]): Promise<WriteResult> {
    return this.lock(() => this.commit(account, change));
  }

  /** Under the lock, synchronous from the read of the stored state to its save: no other write, of any tab, comes between. */
  protected commit(account: string, change: (player: StoredPlayer, hash: string) => DecodedEvent[]): WriteResult {
    this.sync();
    const key = addressKey(account);
    const player: StoredPlayer = structuredClone(this.state.players[key] ?? newPlayer(this.starting));
    const vault = { ...this.state.vault };
    const challenge = this.state.challenge && structuredClone(this.state.challenge);
    const puzzle = this.state.puzzle && structuredClone(this.state.puzzle);
    const hash = `0x6d6f636b${(this.state.transactions + 1).toString(16).padStart(8, "0")}`;
    let events: DecodedEvent[];
    try {
      events = change(player, hash);
    } catch (error) {
      this.state.vault = vault;
      this.state.challenge = challenge;
      this.state.puzzle = puzzle;
      throw error;
    }
    this.state = { ...this.state, players: { ...this.state.players, [key]: player }, transactions: this.state.transactions + 1 };
    this.save();
    return { transactionHash: hash, events };
  }

  /** The device's clock, in seconds (`options.now` when given). */
  protected now(): number {
    return this.options.now?.() ?? Date.now() / 1000;
  }

  /** The time a Challenge write stamps: whole seconds, as a block's. */
  protected second(): number {
    return Math.floor(this.now());
  }

  protected event(name: string, fields: DecodedEvent["fields"]): DecodedEvent {
    return { name, fields, fromAddress: this.options.seller };
  }
}
