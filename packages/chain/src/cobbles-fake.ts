import { COBBLE_DAY, COBBLE_WEEK, COBBLE_WEEK_START, NO_PROGRESS, type CobbleAccount, type CobbleClaim, type PeriodProgress, type QuestCobbles } from "./cobbles";
import type { DecodedEvent } from "./codec";
import type { FakeGameViews } from "./views";
import { ClaimRefusedError, WriteError, type ClaimRefusal, type WriteResult } from "./writer";

/** `Progress.count(task)` of `setup.cairo`: tasks 1 to 4 of a day or a week. */
const periodCount = (p: PeriodProgress, task: number): number => [0, p.games, p.structures, p.points, p.forests][task] ?? 0;

/** `Account.count(task)`: the lifetime counts of tasks 1, 4, 5, 6, 7. */
const lifetimeCount = (a: CobbleAccount, task: number): number => ({ 1: a.games, 4: a.forests, 5: a.wonders, 6: a.big, 7: a.high })[task] ?? 0;

const periodStart = (q: QuestCobbles, period: number): number => (q.kind === "weekly" ? COBBLE_WEEK_START + period * COBBLE_WEEK : period * COBBLE_DAY);

/** `QuestCobbles.is_active`: the copied schedule, with the kind's duration and no end. */
function isActive(q: QuestCobbles, time: number): boolean {
  if (time < q.start || q.interval === 0) return false;
  return (time - q.start) % q.interval < (q.kind === "weekly" ? COBBLE_WEEK : COBBLE_DAY);
}

const bit = (id: number): bigint => 1n << BigInt(id);

/**
 * The claims of `Setup` (cobbles v1) in memory, on a `FakeGameViews` ledger (`cobblePlayer`, `questRates`,
 * `achievementRates`, `tutorialClaims`), with the contract's checks and their typed refusals: the writer's claim methods
 * for a test of the app. A multicall is atomic, as on chain: one refusal leaves the ledger as it was.
 */
export class FakeClaimer {
  /** Every claim batch sent, in order (one entry per transaction). */
  readonly sent: CobbleClaim[][] = [];
  /** The next claim fails with this error (then it is cleared): a dropped RPC, a refused signature. */
  failNext: Error | null = null;
  /** While set, a claim waits for it before answering: the page's "claiming" state. */
  gate: Promise<void> | null = null;
  private transactions = 0;

  constructor(
    readonly views: FakeGameViews,
    readonly address: string,
    private readonly setup = "0x3",
  ) {}

  claimQuest(questId: number, period: number): Promise<WriteResult> {
    return this.claim([{ kind: "quest", questId, period }]);
  }

  claimAchievement(achievementId: number): Promise<WriteResult> {
    return this.claim([{ kind: "achievement", achievementId }]);
  }

  claimDailyCredit(day: number): Promise<WriteResult> {
    return this.claim([{ kind: "credit", credit: "daily", period: day }]);
  }

  claimWeeklyCredit(week: number): Promise<WriteResult> {
    return this.claim([{ kind: "credit", credit: "weekly", period: week }]);
  }

  async claim(claims: readonly CobbleClaim[]): Promise<WriteResult> {
    this.sent.push([...claims]);
    if (this.gate) await this.gate;
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    if (claims.length === 0) throw new WriteError("Nothing to claim");
    const player = this.views.cobblePlayer(this.address);
    // Atomic: work on copies, keep them only when every claim passes.
    const account = { ...player.account };
    const days = new Map([...player.days].map(([k, v]) => [k, { ...v }]));
    const weeks = new Map([...player.weeks].map(([k, v]) => [k, { ...v }]));
    const progressOf = (weekly: boolean, period: number): PeriodProgress => {
      const map = weekly ? weeks : days;
      const found = map.get(period) ?? { ...NO_PROGRESS };
      map.set(period, found);
      return found;
    };
    const hash = `0xfc${(++this.transactions).toString(16)}`;
    const refuse = (reason: ClaimRefusal): never => {
      throw new ClaimRefusedError(reason, hash);
    };
    const events: DecodedEvent[] = [];
    const playerId = this.address;
    for (const c of claims) {
      if (c.kind === "quest") {
        const q = this.views.questRates.get(c.questId);
        if (!q || q.cobbles === 0) refuse("no-cobbles");
        if (!isActive(q!, periodStart(q!, c.period))) refuse("not-live");
        const progress = progressOf(q!.kind === "weekly", c.period);
        if (periodCount(progress, q!.task) < q!.total) refuse("not-completed");
        if (progress.claimed & bit(c.questId)) refuse("claimed");
        progress.claimed |= bit(c.questId);
        account.cobbles += q!.cobbles;
        events.push(this.event("CobblesClaimed", { playerId, kind: 1, id: c.questId, period: c.period, cobbles: q!.cobbles, balance: account.cobbles }));
      } else if (c.kind === "achievement") {
        const a = this.views.achievementRates.get(c.achievementId);
        if (!a || a.cobbles === 0) refuse("no-cobbles");
        const count = a!.task === 10 ? (this.views.tutorialClaims.has(BigInt(playerId)) ? 1 : 0) : lifetimeCount(account, a!.task);
        if (count < a!.total) refuse("not-completed");
        if (account.achievementsClaimed & bit(c.achievementId)) refuse("claimed");
        account.achievementsClaimed |= bit(c.achievementId);
        account.cobbles += a!.cobbles;
        events.push(this.event("CobblesClaimed", { playerId, kind: 2, id: c.achievementId, period: 0, cobbles: a!.cobbles, balance: account.cobbles }));
      } else {
        const weekly = c.credit === "weekly";
        const progress = progressOf(weekly, c.period);
        if (progress.credit) refuse("credit-claimed");
        let live = 0;
        for (const q of this.views.questRates.values()) {
          if (q.cobbles === 0 || (q.kind === "weekly") !== weekly || !isActive(q, periodStart(q, c.period))) continue;
          if (periodCount(progress, q.task) < q.total) refuse("not-completed");
          live += 1;
        }
        if (live === 0) refuse("no-live-quest");
        progress.credit = true;
        account.credits += 1;
        events.push(this.event("CreditClaimed", { playerId, kind: weekly ? 2 : 1, period: c.period, credits: account.credits }));
      }
    }
    player.account = account;
    player.days = days;
    player.weeks = weeks;
    return { transactionHash: hash, events };
  }

  private event(name: string, fields: DecodedEvent["fields"]): DecodedEvent {
    return { name, fields, fromAddress: this.setup };
  }
}
