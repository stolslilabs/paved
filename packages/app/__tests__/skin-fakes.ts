import { SkinRefusedError, WriteError, type DecodedEvent, type FakeGameViews, type SkinChange, type WriteResult } from "@paved/chain";

/**
 * `Setup`'s skin writes (cobbles v1, part 3) in memory, on a `FakeGameViews` ledger (`cobblePlayer`, `skinPlayer`,
 * `priceSkins`), with the contract's checks and their typed refusals: `buy_skin` and `set_skins` for a test of the page.
 * A batch is atomic, as on chain: one refusal leaves the active set as it was.
 */
export class FakeSkinWriter {
  /** Every write sent, in order. */
  readonly sent: Array<{ buy: { theme: number; plan: number } } | { save: SkinChange[] }> = [];
  /** The next write fails with this error (then it is cleared). */
  failNext: Error | null = null;
  /** While set, a write waits for it before answering: the page's pending state. */
  gate: Promise<void> | null = null;
  private transactions = 0;

  constructor(
    readonly views: FakeGameViews,
    readonly address: string,
  ) {}

  async buySkin(theme: number, plan: number): Promise<WriteResult> {
    this.sent.push({ buy: { theme, plan } });
    const hash = await this.begin();
    const price = this.views.skinPriceTable.get(`${theme}:${plan}`) ?? 0;
    const skins = this.views.skinPlayer(this.address);
    const ledger = this.views.cobblePlayer(this.address);
    const owned = skins.owned.get(theme) ?? 0;
    if (price === 0) throw new SkinRefusedError("not-for-sale", hash);
    if (owned & (1 << plan)) throw new SkinRefusedError("owned", hash);
    if (ledger.account.cobbles < price) throw new SkinRefusedError("not-enough-cobbles", hash);
    ledger.account = { ...ledger.account, cobbles: ledger.account.cobbles - price };
    skins.owned.set(theme, owned | (1 << plan));
    return { transactionHash: hash, events: [event("SkinBought", { playerId: this.address, theme, plan, cobbles: price, balance: ledger.account.cobbles })] };
  }

  async setSkins(changes: readonly SkinChange[]): Promise<WriteResult> {
    this.sent.push({ save: changes.map((c) => ({ ...c })) });
    const hash = await this.begin();
    if (changes.length === 0) throw new WriteError("No skin changed");
    const skins = this.views.skinPlayer(this.address);
    const active = [...skins.active];
    for (const { plan, theme } of changes) {
      if (plan < 1 || plan > 19) throw new SkinRefusedError("invalid-skin", hash);
      if (theme !== 0 && !((skins.owned.get(theme) ?? 0) & (1 << plan))) throw new SkinRefusedError("not-owned", hash);
      active[plan - 1] = theme;
    }
    skins.active = active;
    const word = active.reduceRight((w, theme) => (w << 8n) | BigInt(theme), 0n);
    return { transactionHash: hash, events: [event("SkinsActivated", { playerId: this.address, active: `0x${word.toString(16)}` })] };
  }

  private async begin(): Promise<string> {
    if (this.gate) await this.gate;
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    return `0xfd${(++this.transactions).toString(16)}`;
  }
}

const event = (name: string, fields: DecodedEvent["fields"]): DecodedEvent => ({ name, fields, fromAddress: "0x3" });

/** Forest's prices as the fresh deployment sets them (`FRESH_SKIN_PRICES` in `scripts/deploy.sh`, the rarity table), plan 1 first. */
export const FOREST_PRICES = [100, 80, 90, 90, 90, 95, 75, 75, 80, 55, 75, 90, 50, 90, 90, 80, 100, 80, 95];
