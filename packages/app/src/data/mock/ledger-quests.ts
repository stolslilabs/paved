import { ClaimRefusedError, WriteError, type AchievementCobbles, type CobbleClaim, type DecodedEvent, type Definitions, type PeriodProgress, type QuestCobbles, type WriteResult } from "@paved/chain";
import { DAILY_MILESTONES, WEEKLY_MILESTONES, QUEST_BONUS_COBBLES, dailyMilestoneRefusal, weeklyMilestoneRefusal, TUTORIAL_STEPS, tutorialStepRefusal } from "@paved/game-core";
import { TASK } from "./definitions";
import { DailyMilestoneRefusedError, type DailyMilestonesView } from "../daily-milestones";
import { WeeklyMilestoneRefusedError, type WeeklyMilestonesView } from "../weekly-milestones";
import { TutorialStepRefusedError, type TutorialView } from "../tutorial";
import { ACHIEVEMENT_COBBLES } from "../../mocks/cobbles";
import { questPeriod } from "../../lib/quest-window";
import { type StoredPeriod, type StoredPlayer, countTutorial, tutorialCountsOf, bit, sleep } from "./ledger-state";
import { LedgerPlayer } from "./ledger-player";

/** The quests and achievements: the definitions' Cobbles, the days' and weeks' milestones, the tutorial, and their claims. One link of `MockLedger`'s chain (`ledger.ts`). */
export abstract class LedgerQuests extends LedgerPlayer {
  private readonly questRates = new Map<number, QuestCobbles>();

  private readonly achievementRates = new Map<number, AchievementCobbles>();

  /** A day's dailies done, as the mock's indexer serves them (`countDailiesWith`); unset, none. */
  private dailiesDone: ((playerId: string, day: number) => Promise<number>) | null = null;

  /** A week's weeklies done, as the mock's indexer serves them (`countWeekliesWith`); unset, none. */
  private weekliesDone: ((playerId: string, week: number) => Promise<number>) | null = null;

  /**
   * The indexer's definitions with the mock's Cobbles: no quest pays on its own (a daily since #869, a weekly since #976: the
   * period's milestones pay instead), whatever its definition says; an achievement the indexer gives none (an indexer that
   * predates cobbles v1) takes the fresh deployment's table (`mocks/cobbles.ts`), else its points. Learned here: they are what
   * the claims pay. A week's bonus is then refused (`no-live-quest`): no weekly pays.
   */
  definitions(definitions: Definitions): Definitions {
    const quests = definitions.quests.map((q) => {
      const kind = questPeriod({ start: q.startTime, interval: q.interval, duration: q.duration });
      // A quest pays nothing on its own, even where its definition gives it Cobbles: its period's milestones pay (#869, #976).
      const cobbles = 0;
      const cobblesKind = kind;
      const task = q.tasks[0];
      this.questRates.set(q.questId, { questId: q.questId, cobbles, kind: cobblesKind, task: task?.taskId ?? 0, total: task?.total ?? 0, start: q.startTime, interval: q.interval });
      return { ...q, cobbles, cobblesKind };
    });
    const achievements = definitions.achievements.map((a) => {
      const cobbles = a.cobbles > 0 ? a.cobbles : (ACHIEVEMENT_COBBLES.find((r) => r.achievementId === a.achievementId)?.cobbles ?? a.points);
      const task = a.tasks[0];
      this.achievementRates.set(a.achievementId, { achievementId: a.achievementId, cobbles, task: task?.taskId ?? 0, total: task?.total ?? 0 });
      return { ...a, cobbles };
    });
    return { ...definitions, quests, achievements };
  }

  /**
   * Where the milestones' claims read a day's dailies done: the mock's indexer (`mockIndexer`), with the fifth daily. Without
   * one, no daily counts as done and every milestone is refused `not-reached`.
   */
  countDailiesWith(read: (playerId: string, day: number) => Promise<number>): void {
    this.dailiesDone = read;
  }

  /**
   * Where the week's milestones' claims read a week's weeklies done (#976): the mock's indexer (`mockIndexer`), with the two
   * PvP weeklies. Without one, no weekly counts as done and every milestone of the week is refused `not-reached`.
   */
  countWeekliesWith(read: (playerId: string, week: number) => Promise<number>): void {
    this.weekliesDone = read;
  }

  /** When `playerId` claimed First Stone (`claimTutorial`), in seconds; null before: the mock's indexer counts its task from it. */
  tutorialAt(playerId: string): number | null {
    this.sync();
    return this.peek(playerId).tutorialAt ?? null;
  }

  async dayProgress(playerId: string, day: number): Promise<PeriodProgress> {
    this.sync();
    return this.progress(this.peek(playerId).days[day]);
  }

  async weekProgress(playerId: string, week: number): Promise<PeriodProgress> {
    this.sync();
    return this.progress(this.peek(playerId).weeks[week]);
  }

  /** The milestones of `day` claimed (#869): none for a day not played, so each UTC day starts afresh. */
  async dailyMilestones(playerId: string, day: number): Promise<DailyMilestonesView> {
    this.sync();
    return { day, claimed: this.peek(playerId).days[day]?.milestones ?? 0 };
  }

  /**
   * The Tutorial (#977): each task's count, the actions the mock counted since it had them (`countTutorial`), and the player's
   * level; and the steps claimed. A player the ledger never saw has none.
   */
  async tutorialSteps(playerId: string): Promise<TutorialView> {
    this.sync();
    const p = this.peek(playerId);
    return { counts: tutorialCountsOf(p), claimed: p.tutorial?.claimed ?? 0 };
  }

  /** The milestones of `week` claimed (#976): none for a week not played, so each UTC week starts afresh. */
  async weeklyMilestones(playerId: string, week: number): Promise<WeeklyMilestonesView> {
    this.sync();
    return { week, claimed: this.peek(playerId).weeks[week]?.milestones ?? 0 };
  }

  async questCobbles(questId: number): Promise<QuestCobbles> {
    return { ...(this.questRates.get(questId) ?? { questId, cobbles: 0, kind: null, task: 0, total: 0, start: 0, interval: 0 }) };
  }

  async achievementCobbles(achievementId: number): Promise<AchievementCobbles> {
    return { ...(this.achievementRates.get(achievementId) ?? { achievementId, cobbles: 0, task: 0, total: 0 }) };
  }

  /** The claims of `setup.cairo` (`claim_*`), atomic as a multicall: one refusal leaves the ledger as it was. */
  async claim(account: string, claims: readonly CobbleClaim[]): Promise<WriteResult> {
    if (claims.length === 0) throw new WriteError("Nothing to claim");
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      const events: DecodedEvent[] = [];
      for (const c of claims) {
        if (c.kind === "quest") {
          const q = this.questRates.get(c.questId);
          if (!q || q.cobbles === 0 || q.kind === null) throw new ClaimRefusedError("no-cobbles", hash);
          const progress = this.period(p, q.kind === "weekly", c.period);
          if (BigInt(progress.claimed) & bit(c.questId)) throw new ClaimRefusedError("claimed", hash);
          progress.claimed = (BigInt(progress.claimed) | bit(c.questId)).toString();
          p.cobbles += q.cobbles;
          events.push(this.event("CobblesClaimed", { playerId: account, kind: 1, id: c.questId, period: c.period, cobbles: q.cobbles, balance: p.cobbles }));
        } else if (c.kind === "achievement") {
          const a = this.achievementRates.get(c.achievementId);
          if (!a || a.cobbles === 0) throw new ClaimRefusedError("no-cobbles", hash);
          if (BigInt(p.achievementsClaimed) & bit(c.achievementId)) throw new ClaimRefusedError("claimed", hash);
          p.achievementsClaimed = (BigInt(p.achievementsClaimed) | bit(c.achievementId)).toString();
          p.cobbles += a.cobbles;
          events.push(this.event("CobblesClaimed", { playerId: account, kind: 2, id: c.achievementId, period: 0, cobbles: a.cobbles, balance: p.cobbles }));
        } else {
          const weekly = c.credit === "weekly";
          // No bonus for the whole day since #869: its milestones pay instead (`claimDailyMilestone`).
          if (!weekly) throw new ClaimRefusedError("no-live-quest", hash);
          if (![...this.questRates.values()].some((q) => q.cobbles > 0 && (q.kind === "weekly") === weekly)) throw new ClaimRefusedError("no-live-quest", hash);
          const progress = this.period(p, weekly, c.period);
          if (progress.credit) throw new ClaimRefusedError("credit-claimed", hash);
          progress.credit = true;
          // PvP v2 (#741, #738): finishing every weekly quest pays bonus Cobbles instead of a free game
          const bonus = QUEST_BONUS_COBBLES.weekly;
          p.cobbles += bonus;
          events.push(this.event("CreditClaimed", { playerId: account, kind: 2, period: c.period, credits: p.credits, cobbles: bonus, balance: p.cobbles }));
        }
      }
      return events;
    });
  }

  /**
   * `Setup.claim_tutorial()` (D-21, #927): First Stone's progress, reported once. Idempotent as the contract's: the first claim
   * emits `AchievementProgressed { task 10 }`, a later one nothing, so the receipt tells them apart (`claimOutcome`).
   */
  async claimTutorial(account: string): Promise<WriteResult> {
    await sleep(this.latency);
    return this.write(account, (p) => {
      if (p.tutorialAt !== undefined) return [];
      p.tutorialAt = this.second();
      return [this.event("AchievementProgressed", { playerId: account, taskId: TASK.tutorialFinished, count: 1 })];
    });
  }

  /**
   * A milestone of the day (#869): `DAILY_MILESTONES[step]`'s Cobbles, once for `day`, refused until that day has the
   * milestone's dailies done (read from the indexer, `countDailiesWith`).
   */
  async claimDailyMilestone(account: string, day: number, step: number): Promise<WriteResult> {
    const [done] = await Promise.all([this.dailiesDone ? this.dailiesDone(account, day) : 0, sleep(this.latency)]);
    return this.write(account, (p, hash) => {
      const progress = this.period(p, false, day);
      const claimed = progress.milestones ?? 0;
      const refusal = dailyMilestoneRefusal(step, done, claimed);
      if (refusal) throw new DailyMilestoneRefusedError(refusal, hash);
      const milestone = DAILY_MILESTONES[step]!;
      progress.milestones = claimed | (1 << step);
      p.cobbles += milestone.cobbles;
      countTutorial(p, "milestone-claimed");
      return [this.event("DailyMilestoneClaimed", { playerId: account, day, step, cobbles: milestone.cobbles, balance: p.cobbles })];
    });
  }

  /**
   * A milestone of the week (#976): `WEEKLY_MILESTONES[step]`'s Cobbles, once for `week`, refused until that week has the
   * milestone's weeklies done (read from the indexer, `countWeekliesWith`). The week's claims made before it stay as they were.
   */
  async claimWeeklyMilestone(account: string, week: number, step: number): Promise<WriteResult> {
    const [done] = await Promise.all([this.weekliesDone ? this.weekliesDone(account, week) : 0, sleep(this.latency)]);
    return this.write(account, (p, hash) => {
      const progress = this.period(p, true, week);
      const claimed = progress.milestones ?? 0;
      const refusal = weeklyMilestoneRefusal(step, done, claimed);
      if (refusal) throw new WeeklyMilestoneRefusedError(refusal, hash);
      const milestone = WEEKLY_MILESTONES[step]!;
      progress.milestones = claimed | (1 << step);
      p.cobbles += milestone.cobbles;
      return [this.event("WeeklyMilestoneClaimed", { playerId: account, week, step, cobbles: milestone.cobbles, balance: p.cobbles })];
    });
  }

  /**
   * A step of the Tutorial (#977): `TUTORIAL_STEPS[id - 1]`'s Cobbles, once, refused while a step before it is not completed
   * (`locked`) or it is not (`not-done`), on the counts the mock keeps (`tutorialSteps`).
   */
  async claimTutorialStep(account: string, id: number): Promise<WriteResult> {
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      const claimed = p.tutorial?.claimed ?? 0;
      const refusal = tutorialStepRefusal(id, tutorialCountsOf(p), claimed);
      if (refusal) throw new TutorialStepRefusedError(refusal, hash);
      const step = TUTORIAL_STEPS[id - 1]!;
      (p.tutorial ??= { counts: {}, claimed: 0 }).claimed = claimed | (1 << (id - 1));
      p.cobbles += step.cobbles;
      return [this.event("TutorialStepClaimed", { playerId: account, step: id, cobbles: step.cobbles, balance: p.cobbles })];
    });
  }

  private progress(stored: StoredPeriod | undefined): PeriodProgress {
    return { games: 0, structures: 0, forests: 0, points: 0, claimed: BigInt(stored?.claimed ?? "0"), credit: stored?.credit ?? false };
  }

  private period(p: StoredPlayer, weekly: boolean, period: number): StoredPeriod {
    const map = weekly ? p.weeks : p.days;
    map[period] ??= { claimed: "0", credit: false };
    return map[period]!;
  }
}
