import { PvpRefusedError, costOf, offerOf, type DecodedEvent, type WriteResult, type Attack, type AttackDeck, type AttackMove, type AttackPlay, type IndexedAttack, type LeagueStatus, type MatchmakerVillage, type NpcLevel, type PvpMatch, type PvpShield } from "@paved/chain";
import { AttackRun, poseidon, startTerritory } from "@paved/game-core";
import { NEXT_PRICE, SHIELD_S, stakesOf, starsFor } from "../../lib/pvp-rules";
import { MOCK_SEASON_STARTS, mockRival, mockRivals, mockSeasonOf } from "./pvp";
import { seededPlayer } from "./players";
import { leagueIndex } from "./community";
import { mockRivalV2 } from "./v2";
import { addressKey } from "../keys";
import { type StoredPlayer, type StoredAttack, freshPvp, MOCK_ATTACK, MOCK_MATCHMAKER, MATCH_DRAW, PLAY_REFUSALS, drawTile, freshRewards, sleep } from "./ledger-state";
import { LedgerChallenge } from "./ledger-challenge";

/** PvP v1: the matchmaker's reads, the indexer's attacks, and the attack's writes. One link of `MockLedger`'s chain (`ledger.ts`). */
export abstract class LedgerPvp extends LedgerChallenge {
  /** `Matchmaker.village(v)`: a founded village is joined (an operator joins it, #639); a rival always is. */
  async pvpVillage(village: string): Promise<MatchmakerVillage> {
    if (mockRival(village)) return { status: 1, draws: 0 };
    this.sync();
    const p = this.peek(village);
    return { status: p.village ? 1 : 0, draws: p.pvp?.draws ?? 0 };
  }

  async pvpMatch(attacker: string): Promise<PvpMatch> {
    this.sync();
    const match = this.peek(attacker).pvp?.match;
    return match ? { ...match } : { opponent: "0x0", offer: 0, cost: 0, started: false };
  }

  /** `Matchmaker.league(v)`: the season of the mock's clock, the crowns and their league, the season's peak and attacks. */
  async pvpLeague(village: string): Promise<LeagueStatus> {
    const season = mockSeasonOf(Math.floor(Date.now() / 1000));
    const rival = mockRival(village) ?? seededPlayer(village);
    if (rival) return { season, crowns: rival.crowns, league: leagueIndex(rival.crowns), peak: leagueIndex(rival.crowns), attacks: 0, pending: 0 };
    this.sync();
    const pvp = this.peek(village).pvp;
    const crowns = pvp?.crowns ?? 0;
    const current = pvp?.season === season;
    return { season, crowns, league: leagueIndex(crowns), peak: current ? Math.max(pvp!.peak, leagueIndex(crowns)) : leagueIndex(crowns), attacks: current ? pvp!.seasonAttacks : 0, pending: 0 };
  }

  /** `Matchmaker.shield(v)`: an attacked village's 8 hours (queue 2), dropped when its owner attacks; a rival's (v1 or v2) is the ledger's. */
  async pvpShield(village: string): Promise<PvpShield> {
    this.sync();
    const rival = mockRival(village) ?? mockRivalV2(village);
    const until = rival ? (this.state.rivalShields?.[addressKey(village)] ?? 0) : (this.peek(village).pvp?.shieldUntil ?? 0);
    const up = until > Math.floor(Date.now() / 1000);
    return { queue: up ? 2 : 0, up, seq: 0, until: up ? until : 0 };
  }

  async pvpSeasonStart(season: number): Promise<number> {
    return MOCK_SEASON_STARTS[season - 1] ?? 0;
  }

  async pvpAttack(attacker: string): Promise<Attack> {
    this.sync();
    const a = this.peek(attacker).pvp?.attacks.at(-1);
    if (!a) return { id: 0, status: 0, defender: "0x0", npc: false, parcels: 0, target: 0, board: 0, placed: 0, startedAt: 0, score: 0, stars: 0 };
    const rival = mockRival(a.defender);
    return {
      id: a.id,
      status: a.status,
      defender: a.defender,
      npc: false,
      parcels: (rival?.cells.length ?? 9) - 9,
      target: a.target,
      board: a.id,
      placed: a.moves.filter((m) => !m.discard).length,
      startedAt: a.openedAt,
      score: a.score,
      stars: a.stars,
    };
  }

  async pvpDeck(attacker: string, id: number): Promise<AttackDeck> {
    this.sync();
    const a = this.peek(attacker).pvp?.attacks.find((x) => x.id === id);
    if (!a) return { size: 0, drawn: 0, hand: 0, bitmap: 0n };
    const open = a.status === MOCK_ATTACK.open && a.drawn.length > a.moves.length;
    return { size: a.plans.length, drawn: a.drawn.length, hand: open ? a.plans[a.drawn.at(-1)!]! : 0, bitmap: a.drawn.reduce((b, i) => b | (1n << BigInt(i)), 0n) };
  }

  async pvpMoves(attacker: string, id: number): Promise<AttackMove[]> {
    this.sync();
    return (this.peek(attacker).pvp?.attacks.find((x) => x.id === id)?.moves ?? []).map((m) => (m.discard ? { ...m } : { ...m, cell: { ...m.cell } }));
  }

  async pvpNpcLevel(): Promise<NpcLevel> {
    return { campaign: 0, level: 0 };
  }

  /** A rival village's name (the mock's opponents, PvP v1's and v2's) or a seeded player's (`players.ts`), or null for any other player. */
  rivalName(playerId: string): string | null {
    return mockRival(playerId)?.name ?? mockRivalV2(playerId)?.name ?? seededPlayer(playerId)?.name ?? null;
  }

  /** The indexer's attacks that ended (`/players/:id/attacks` and `/defences`): the mock's rivals never attack, so a village has none. */
  attacksOf(playerId: string, side: "attacker" | "defender"): IndexedAttack[] {
    this.sync();
    if (side === "defender") return [];
    return (this.peek(playerId).pvp?.attacks ?? [])
      .filter((a) => a.status === MOCK_ATTACK.finished || a.status === MOCK_ATTACK.surrendered)
      .map((a) => ({
        attacker: addressKey(playerId),
        id: a.id,
        defender: a.defender,
        npc: false,
        target: a.target,
        tiles: a.plans.length,
        score: a.score,
        stars: a.stars,
        surrendered: a.status === MOCK_ATTACK.surrendered,
        gained: a.gained,
        lost: a.lost,
        openedAt: a.openedAt,
        finishedAt: a.finishedAt,
      }))
      .reverse();
  }

  /**
   * `Matchmaker.search()` (free) or `next()` (a Cobble): a rival drawn among the three nearest the attacker's crowns that are
   * not shielded (a Poseidon of the draw stands in for the VRF), its offer and cost fixed now. `search` refuses while a drawn
   * opponent is still open to attack; `next` needs one drawn and draws another.
   */
  async drawOpponent(account: string, kind: "search" | "next"): Promise<WriteResult> {
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      if (!p.village) throw new PvpRefusedError("not-joined", hash);
      const pvp = (p.pvp ??= freshPvp());
      const now = Math.floor(Date.now() / 1000);
      if (pvp.attacks.at(-1)?.status === MOCK_ATTACK.open) throw new PvpRefusedError("attack-started", hash);
      const shielded = (address: string) => (this.state.rivalShields?.[addressKey(address)] ?? 0) > now;
      if (kind === "search" && pvp.match && !shielded(pvp.match.opponent)) throw new PvpRefusedError("opponent-drawn", hash);
      if (kind === "next" && !pvp.match) throw new PvpRefusedError("nothing-drawn", hash);
      const events: DecodedEvent[] = [];
      if (kind === "next") {
        if (p.cobbles < NEXT_PRICE) throw new PvpRefusedError("not-enough-cobbles", hash);
        p.cobbles -= NEXT_PRICE;
        events.push(this.event("CobblesSpent", { playerId: account, spender: MOCK_MATCHMAKER, reason: "MATCH_NEXT", cobbles: NEXT_PRICE, balance: p.cobbles }));
      }
      const current = pvp.match ? BigInt(pvp.match.opponent) : -1n;
      const pool = mockRivals()
        .filter((r) => !shielded(r.address) && BigInt(r.address) !== current)
        .sort((a, b) => Math.abs(a.crowns - pvp.crowns) - Math.abs(b.crowns - pvp.crowns))
        .slice(0, 3);
      if (pool.length === 0) throw new PvpRefusedError("no-opponent", hash);
      const rival = pool[Number(poseidon(MATCH_DRAW, BigInt(account), BigInt(pvp.draws)) % BigInt(pool.length))]!;
      const offer = offerOf(pvp.crowns, rival.crowns);
      const cost = costOf(pvp.crowns, rival.crowns);
      events.push(this.event("OpponentDrawn", { attacker: account, opponent: rival.address, offer, cost, drawIndex: pvp.draws, paid: kind === "next" }));
      pvp.draws += 1;
      pvp.match = { opponent: rival.address, offer, cost, started: false };
      return events;
    });
  }

  /** `Arena.start()`: the attack on the drawn rival, its tiles copied (the snapshot), the first one drawn; the attacker's shield dropped, the rival's up for 8 hours. */
  async startAttack(account: string): Promise<WriteResult> {
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      const pvp = (p.pvp ??= freshPvp());
      if (pvp.attacks.at(-1)?.status === MOCK_ATTACK.open) throw new PvpRefusedError("attack-open", hash);
      if (!pvp.match) throw new PvpRefusedError("nothing-drawn", hash);
      const now = Math.floor(Date.now() / 1000);
      const key = addressKey(pvp.match.opponent);
      if ((this.state.rivalShields?.[key] ?? 0) > now) throw new PvpRefusedError("opponent-shielded", hash);
      const rival = mockRival(pvp.match.opponent)!;
      const id = pvp.attacks.length + 1;
      const plans = rival.tiles.filter((t) => t.id !== 1).map((t) => t.plan);
      const attack: StoredAttack = {
        id,
        status: MOCK_ATTACK.open,
        defender: rival.address,
        target: rival.score,
        offer: pvp.match.offer,
        cost: pvp.match.cost,
        plans,
        drawn: [],
        moves: [],
        openedAt: now,
        score: 0,
        stars: 0,
        gained: 0,
        lost: 0,
        finishedAt: 0,
      };
      const first = drawTile(account, attack);
      pvp.attacks.push(attack);
      pvp.match = { ...pvp.match, started: true };
      pvp.shieldUntil = 0;
      this.state.rivalShields = { ...this.state.rivalShields, [key]: now + SHIELD_S };
      return [
        this.event("AttackOpened", { attacker: account, defender: rival.address, id, npc: false, offer: attack.offer, target: attack.target, tiles: plans.length }),
        this.event("TileDrawn", { attacker: account, id, draw: 0, plan: first }),
      ];
    });
  }

  /**
   * `Arena.play(...)`: the tile in hand built (checked on game-core's engine in the snapshot's territory, as `Arena` checks
   * it) or discarded; the next tile drawn, or the finish: the moves scored, the stars, the crowns settled, a village reward
   * granted (#642, `Setup.report_pvp`).
   */
  async playAttack(account: string, play: AttackPlay): Promise<WriteResult> {
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      const a = p.pvp?.attacks.at(-1);
      if (!a || a.status !== MOCK_ATTACK.open) throw new PvpRefusedError("no-attack", hash);
      const plan = a.plans[a.drawn.at(-1)!]!;
      const run = this.attackRun(a);
      const move: AttackMove = play.discard ? { plan, discard: true } : { plan, discard: false, orientation: play.orientation, cell: { ...play.cell } };
      if (!play.discard) {
        const refused = run.refusal(plan, play.orientation, play.cell);
        if (refused) throw new PvpRefusedError(PLAY_REFUSALS[refused] ?? "cannot-place", hash);
      }
      run.apply(move.discard ? { plan, discard: true } : { plan, discard: false, orientation: move.orientation, cell: move.cell });
      const index = a.moves.length;
      a.moves.push(move);
      const at = move.discard ? { orientation: 0, x: 0, y: 0 } : { orientation: move.orientation, x: 0x7fffffff + move.cell.x, y: 0x7fffffff + move.cell.y };
      const events = [this.event("AttackPlayed", { attacker: account, id: a.id, index, plan, discard: move.discard, ...at })];
      if (a.drawn.length < a.plans.length) {
        const next = drawTile(account, a);
        events.push(this.event("TileDrawn", { attacker: account, id: a.id, draw: a.drawn.length - 1, plan: next }));
        return events;
      }
      return [...events, ...this.finish(account, p, a, run.score, false)];
    });
  }

  /** `Arena.surrender()`: the open attack ended at 0 stars, its 0-star cost paid. */
  async surrenderAttack(account: string): Promise<WriteResult> {
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      const a = p.pvp?.attacks.at(-1);
      if (!a || a.status !== MOCK_ATTACK.open) throw new PvpRefusedError("no-attack", hash);
      return this.finish(account, p, a, 0, true);
    });
  }

  /** A stored attack's moves on game-core's engine, in its defender's territory. */
  private attackRun(a: StoredAttack): AttackRun {
    const rival = mockRival(a.defender);
    return AttackRun.replay(
      { territory: rival?.cells ?? startTerritory() },
      a.moves.map((m) => (m.discard ? { plan: m.plan, discard: true as const } : { plan: m.plan, discard: false as const, orientation: m.orientation, cell: m.cell })),
    );
  }

  /** An attack's end (`Matchmaker.settle`): the stars of its score, the crowns (a rival's never change, as an NPC's), the season's count, a village reward. */
  private finish(account: string, p: StoredPlayer, a: StoredAttack, score: number, surrendered: boolean): DecodedEvent[] {
    const stars = surrendered ? 0 : starsFor(score, a.target);
    const { gained, lost } = this.settle(p, stars, a.offer, a.cost);
    p.pvp!.match = null;
    Object.assign(a, { status: surrendered ? MOCK_ATTACK.surrendered : MOCK_ATTACK.finished, score, stars, gained, lost, finishedAt: Math.floor(Date.now() / 1000) });
    const rewards = (p.rewards ??= freshRewards());
    rewards.pending += 1;
    return [this.event("AttackFinished", { attacker: account, defender: a.defender, id: a.id, gameId: a.id, score, stars, surrendered, gained, lost })];
  }

  /** The crowns of an attack's end, and the season's count (`Matchmaker.settle`), shared by PvP v1 and v2. */
  protected settle(p: StoredPlayer, stars: number, offer: number, cost: number): { gained: number; lost: number } {
    const pvp = (p.pvp ??= freshPvp());
    const stakes = stakesOf(offer, cost);
    const gained = stars > 0 ? stakes.win[stars - 1]! : 0;
    const lost = stars > 0 ? 0 : Math.min(cost, pvp.crowns);
    pvp.crowns += gained - lost;
    const season = mockSeasonOf(Math.floor(Date.now() / 1000));
    if (pvp.season !== season) {
      pvp.season = season;
      pvp.seasonAttacks = 0;
      pvp.peak = 0;
    }
    pvp.seasonAttacks += 1;
    pvp.peak = Math.max(pvp.peak, leagueIndex(pvp.crowns));
    return { gained, lost };
  }
}
