import { costOf, offerOf, type DecodedEvent, type WriteResult } from "@paved/chain";
import { CAMPAIGNS, PVP_CHESTS_PER_DAY, QueuedAttack, addXp, attackDeck, attackStars, dayOf, drawChest, inventoryOf, activateSlotRefusal, buySlotRefusal, layoutRefusal, layoutScore, layoutSlotOpen, layoutSlotPrice, levelStatus, poseidon, pvpChestGranted, pvpChestRank, pvpXp, shopEndsAt, shopOffers, starterLayout, storyChestRank, storyXp, saveSlotRefusal, withSlotActive, withSlotBought, withSlotSaved, type LayoutTile, type QueuedMove } from "@paved/game-core";
import { NEXT_PRICE, SHIELD_S, stakesOf } from "../../lib/pvp-rules";
import { seededPlayer } from "./players";
import { leagueIndex, levelAt, seededVillage } from "./community";
import { freshV2, mockRivalV2, mockRivalsV2, slotsOfV2, storeSlotsV2, type StoredAttackV2, type StoredDefenceV2, type StoredV2 } from "./v2";
import type { BuyLayoutSlotRequest, LayoutSlotsView } from "../layout-slots";
import { V2RefusedError, type BuyTileRequest, type ChestsView, type FreeVillageView, type ShopView, type StoryReport } from "../free-village";
import type { AttackV2, AttackV2State } from "../free-attack";
import type { MatchRecord } from "../matches";
import { generatedLook } from "../../mocks/avatar";
import { addressKey } from "../keys";
import { type StoredPlayer, freshPvp, MOCK_MATCHMAKER, MATCH_DRAW_V2, ATTACK_DRAW_V2, DEFENCE_DRAW_V2, CHEST_DRAW, countTutorial, sleep, plainMove } from "./ledger-state";
import { LedgerPvp } from "./ledger-pvp";

/** PvP v2 (#741): the free village, its layouts, chests and shop, the attacks and their writes (the rules are game-core's). One link of `MockLedger`'s chain (`ledger.ts`). */
export abstract class LedgerPvpV2 extends LedgerPvp {
  /**
   * The player's settled PvP v2 attacks (#976), oldest first: when each ended and its stars (a surrender's none), the rows
   * `Setup.report_pvp` reports to the quests. The mock's indexer counts the PvP weeklies from them.
   */
  settledAttacks(playerId: string): { finishedAt: number; stars: number }[] {
    this.sync();
    return (this.peek(playerId).v2?.attacks ?? [])
      .filter((a) => a.status !== "open")
      .map((a) => ({ finishedAt: a.finishedAt, stars: a.stars }))
      .sort((a, b) => a.finishedAt - b.finishedAt);
  }

  /** A village of PvP v2: the saved layout and its score (game-core's `layoutScore`), the level and slots; a rival's too. */
  async freeVillage(playerId: string): Promise<FreeVillageView> {
    const rival = mockRivalV2(playerId);
    if (rival) return { founded: true, xp: 0, level: rival.level, slots: rival.slots, tiles: rival.tiles.map((t) => ({ ...t })), score: rival.score };
    const seeded = seededPlayer(playerId);
    if (seeded) {
      // A seeded player's village is the layout of a rival of its level or below (the highest such, then the seeded one's turn).
      const layout = seededVillage(seeded);
      const { xp, slots } = levelAt(seeded.level);
      return { founded: true, xp, level: seeded.level, slots, tiles: layout.tiles.map((t) => ({ ...t })), score: layout.score };
    }
    this.sync();
    const v2 = this.peek(playerId).v2 ?? freshV2();
    const { xp, level, slots } = levelStatus(v2.xp);
    const tiles = v2.layout ?? [];
    return { founded: v2.layout !== null, xp, level, slots, tiles: tiles.map((t) => ({ ...t })), score: layoutScore(tiles) };
  }

  /** The saved layouts' slots (#804): each one's layout, score and whether it still fits; not founded, the free slot empty. */
  async layoutSlots(playerId: string): Promise<LayoutSlotsView> {
    this.sync();
    const v2 = this.peek(playerId).v2 ?? freshV2();
    const slots = v2.layout ? slotsOfV2({ ...v2, layout: v2.layout }) : null;
    const limits = { slots: levelStatus(v2.xp).slots, inventory: v2.inventory };
    return {
      active: slots?.active ?? 0,
      slots: [0, 1, 2].map((slot) => {
        const tiles = slots?.layouts[slot] ?? null;
        return {
          slot,
          open: slots ? layoutSlotOpen(slots, slot) : slot === 0,
          price: layoutSlotPrice(slot)!,
          tiles: tiles ? tiles.map((t) => ({ ...t })) : null,
          score: tiles ? layoutScore(tiles) : 0,
          fits: tiles !== null && layoutRefusal(tiles, limits) === null,
        };
      }),
    };
  }

  async inventory(playerId: string): Promise<number[]> {
    const rival = mockRivalV2(playerId);
    if (rival) return inventoryOf(rival.tiles.map((t) => t.plan));
    this.sync();
    return [...(this.peek(playerId).v2 ?? freshV2()).inventory];
  }

  async chests(playerId: string): Promise<ChestsView> {
    this.sync();
    const v2 = this.peek(playerId).v2 ?? freshV2();
    const open = v2.chests.open;
    return {
      pending: v2.chests.pending.map((c) => c.rank),
      origins: v2.chests.pending.map((c) => c.origin ?? null),
      open: open ? { rank: open.rank, plans: [...open.plans], cobbles: open.cobbles } : null,
      openOrigin: open?.origin ?? null,
      pvpToday: v2.pvpChests[dayOf(this.now())] ?? 0,
      pvpCap: PVP_CHESTS_PER_DAY,
    };
  }

  async shop(playerId: string, day: number): Promise<ShopView> {
    this.sync();
    const bought = (this.peek(playerId).v2 ?? freshV2()).bought[day] ?? [];
    return { day, endsAt: shopEndsAt(day), offers: shopOffers(day).map((o) => ({ ...o, bought: bought.includes(o.slot) })) };
  }

  /** The attacker's opponent drawn and their attack, the open one or the last. */
  async attackV2(attacker: string): Promise<AttackV2State> {
    this.sync();
    const v2 = this.peek(attacker).v2 ?? freshV2();
    const rival = v2.match ? mockRivalV2(v2.match.opponent) : null;
    const match = v2.match && rival ? { opponent: rival.address, name: rival.name, level: rival.level, slots: rival.slots, target: rival.score, deck: rival.deck, offer: v2.match.offer, cost: v2.match.cost, crowns: rival.crowns } : null;
    const a = v2.attacks.at(-1);
    return { match, attack: a ? this.attackView(a, v2.attacks) : null };
  }

  /** The attacker's v2 attack `id`, open or ended, or null: every attack stays in the record, so a result's link stays good. */
  async attackV2Of(attacker: string, id: number): Promise<AttackV2 | null> {
    this.sync();
    const attacks = (this.peek(attacker).v2 ?? freshV2()).attacks;
    const a = attacks.find((x) => x.id === id);
    return a ? this.attackView(a, attacks) : null;
  }

  /**
   * The player's matches (#786): their attacks that ended and their rivals' attacks on their village, newest first, each with
   * the attacked village's snapshot at its start (a save from before the snapshot shows the rival's layout, which never changes).
   */
  async matchesV2(playerId: string): Promise<MatchRecord[]> {
    this.sync();
    const v2 = this.peek(playerId).v2 ?? freshV2();
    const copy = (moves: StoredAttackV2["moves"]) => moves.map((m) => (m.discard ? { ...m } : { ...m, cell: { ...m.cell } }));
    const rivalOf = (address: string) => {
      const rival = mockRivalV2(address);
      // A rival lives on no device and saved no avatar: a face seeded by its address (#834), not an initial.
      return { address, name: rival?.name ?? null, level: rival?.level ?? 0, look: String(generatedLook(address)), ...(rival && { league: leagueIndex(rival.crowns) }) };
    };
    const attacks: MatchRecord[] = v2.attacks
      .filter((a) => a.status !== "open")
      .map((a) => ({
        id: `a${a.id}`,
        side: "attack",
        rival: rivalOf(a.defender),
        village: (a.village ?? mockRivalV2(a.defender)?.tiles ?? []).map((t) => ({ ...t })),
        target: a.target,
        moves: copy(a.moves),
        score: a.score,
        stars: a.stars,
        surrendered: a.status === "surrendered",
        crowns: a.gained - a.lost,
        xp: a.xp,
        chest: a.chest,
        finishedAt: a.finishedAt,
      }));
    const defences: MatchRecord[] = (v2.defences ?? []).map((d) => ({
      id: `d${d.id}`,
      side: "defence",
      rival: rivalOf(d.attacker),
      village: d.village.map((t) => ({ ...t })),
      target: d.target,
      moves: copy(d.moves),
      score: d.score,
      stars: d.stars,
      surrendered: false,
      crowns: d.crowns,
      xp: 0,
      chest: null,
      finishedAt: d.finishedAt,
    }));
    // Oldest first, an answer after the attack it answers within the same second; then newest first.
    return [...attacks, ...defences].sort((x, y) => x.finishedAt - y.finishedAt || (x.side === y.side ? 0 : x.side === "attack" ? -1 : 1)).reverse();
  }

  /** Founds the free village: the starter layout the address picks (`starterLayout`), its 8 tiles added to the inventory. */
  async foundFreeVillage(account: string): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (_p, v2, hash) => {
      if (v2.layout) throw new V2RefusedError("founded", hash);
      return this.foundV2(account, v2);
    });
  }

  /**
   * The account's first connection (#927, #753): its free village founded with it, as `foundFreeVillage` founds it, so the home
   * shows the starter and its 8 tiles and Edit opens. An account whose village is founded already is left as it was, nothing
   * stored. No latency: the connection's own step, not a write the player sends. Resolves true when it founded the village.
   */
  async foundAtConnection(account: string): Promise<boolean> {
    return this.lock(() => {
      this.sync();
      if (this.peek(account).v2?.layout) return false;
      this.commit(account, (p) => this.foundV2(account, (p.v2 ??= freshV2())));
      return true;
    });
  }

  /** Saves the whole layout, checked against the slots of the player's level and their inventory (`layoutRefusal`). */
  async saveLayout(account: string, tiles: readonly LayoutTile[]): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (p, v2, hash) => {
      if (!v2.layout) throw new V2RefusedError("no-village", hash);
      const layout = tiles.map((t) => ({ plan: t.plan, orientation: t.orientation, x: t.x, y: t.y }));
      const refused = layoutRefusal(layout, { slots: levelStatus(v2.xp).slots, inventory: v2.inventory });
      if (refused) throw new V2RefusedError(refused, hash);
      const slots = slotsOfV2({ ...v2, layout: v2.layout });
      storeSlotsV2(v2, withSlotSaved(slots, slots.active, layout));
      // A tile placed and saved (#977, Builder): an empty layout places none.
      if (layout.length > 0) countTutorial(p, "layout-saved");
      return [this.event("LayoutSaved", { playerId: account, tiles: layout.length, score: layoutScore(layout) })];
    });
  }

  /** Saves a layout into an open slot (#804), checked as `saveLayout` checks it: into the active one, the village changes. */
  async saveLayoutTo(account: string, slot: number, tiles: readonly LayoutTile[]): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (p, v2, hash) => {
      if (!v2.layout) throw new V2RefusedError("no-village", hash);
      const layout = tiles.map((t) => ({ plan: t.plan, orientation: t.orientation, x: t.x, y: t.y }));
      const slots = slotsOfV2({ ...v2, layout: v2.layout });
      const refused = saveSlotRefusal(slots, slot, layout, { slots: levelStatus(v2.xp).slots, inventory: v2.inventory });
      if (refused) throw new V2RefusedError(refused, hash);
      storeSlotsV2(v2, withSlotSaved(slots, slot, layout));
      // A tile placed and saved (#977, Builder): an empty layout places none.
      if (layout.length > 0) countTutorial(p, "layout-saved");
      return [this.event("LayoutSlotSaved", { playerId: account, slot, active: slot === slots.active, tiles: layout.length, score: layoutScore(layout) })];
    });
  }

  /** Makes a saved slot's layout the village (#804): the one attackers face, checked against the stock and the slots. */
  async activateLayout(account: string, slot: number): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (_p, v2, hash) => {
      if (!v2.layout) throw new V2RefusedError("no-village", hash);
      const slots = slotsOfV2({ ...v2, layout: v2.layout });
      const refused = activateSlotRefusal(slots, slot, { slots: levelStatus(v2.xp).slots, inventory: v2.inventory });
      if (refused) throw new V2RefusedError(refused, hash);
      storeSlotsV2(v2, withSlotActive(slots, slot));
      return [this.event("LayoutActivated", { playerId: account, slot, score: layoutScore(v2.layout) })];
    });
  }

  /** Buys a locked layout slot (#804) at the price the page showed, in Cobbles: it opens empty. */
  async buyLayoutSlot(account: string, { slot, confirmedPrice }: BuyLayoutSlotRequest): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (p, v2, hash) => {
      if (!v2.layout) throw new V2RefusedError("no-village", hash);
      const slots = slotsOfV2({ ...v2, layout: v2.layout });
      const refused = buySlotRefusal(slots, slot, confirmedPrice, p.cobbles);
      if (refused) throw new V2RefusedError(refused, hash);
      p.cobbles -= confirmedPrice;
      storeSlotsV2(v2, withSlotBought(slots, slot));
      return [
        this.event("CobblesSpent", { playerId: account, spender: this.options.seller, reason: "LAYOUT_SLOT", cobbles: confirmedPrice, balance: p.cobbles }),
        this.event("LayoutSlotBought", { playerId: account, slot, price: confirmedPrice }),
      ];
    });
  }

  /**
   * Opens a chest waiting (`drawChest`, a Poseidon for the VRF): the one at `index` in the pending list, the player's pick (#784),
   * the oldest when unset. Its tiles shown, its Cobbles credited when they drop.
   */
  async openChest(account: string, index = 0): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (p, v2, hash) => {
      if (v2.chests.open) throw new V2RefusedError("chest-open", hash);
      const chest = Number.isInteger(index) && index >= 0 ? v2.chests.pending.splice(index, 1)[0] : undefined;
      if (!chest) throw new V2RefusedError("no-chest", hash);
      const draw = drawChest(chest.rank, chest.league, poseidon(CHEST_DRAW, BigInt(account), BigInt(v2.chests.opened)));
      v2.chests.opened += 1;
      v2.chests.open = { rank: draw.rank, plans: [...draw.plans], cobbles: draw.cobbles, ...(chest.origin ? { origin: chest.origin } : {}) };
      p.cobbles += draw.cobbles;
      countTutorial(p, "chest-opened");
      return [this.event("ChestOpened", { playerId: account, rank: draw.rank, plans: draw.plans.join(","), cobbles: draw.cobbles, balance: p.cobbles })];
    });
  }

  /** Takes tile `slot` of the open chest into the inventory. */
  async claimChest(account: string, slot: number): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (_p, v2, hash) => {
      const open = v2.chests.open;
      if (!open) throw new V2RefusedError("no-open-chest", hash);
      const plan = open.plans[slot];
      if (!Number.isInteger(slot) || plan === undefined) throw new V2RefusedError("not-a-slot", hash);
      v2.inventory[plan - 1] = (v2.inventory[plan - 1] ?? 0) + 1;
      v2.chests.open = null;
      return [this.event("ChestClaimed", { playerId: account, rank: open.rank, plan })];
    });
  }

  /** Buys offer `slot` of today's shop (`shopOffers`) at the price the page showed: once per offer and day, paid in Cobbles. */
  async buyTile(account: string, { day, slot, confirmedPrice }: BuyTileRequest): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (p, v2, hash) => {
      const today = dayOf(this.now());
      if (day !== today) throw new V2RefusedError("shop-closed", hash);
      const offer = shopOffers(today)[slot];
      if (!Number.isInteger(slot) || !offer) throw new V2RefusedError("not-a-slot", hash);
      if (offer.price !== confirmedPrice) throw new V2RefusedError("price-changed", hash);
      const bought = v2.bought[today] ?? [];
      if (bought.includes(slot)) throw new V2RefusedError("bought", hash);
      if (p.cobbles < offer.price) throw new V2RefusedError("not-enough-cobbles", hash);
      p.cobbles -= offer.price;
      v2.inventory[offer.plan - 1] = (v2.inventory[offer.plan - 1] ?? 0) + 1;
      v2.bought = { [today]: [...bought, slot] };
      countTutorial(p, "shop-bought");
      return [
        this.event("CobblesSpent", { playerId: account, spender: this.options.seller, reason: "SHOP_TILE", cobbles: offer.price, balance: p.cobbles }),
        this.event("TileBought", { playerId: account, day: today, slot, plan: offer.plan, price: offer.price }),
      ];
    });
  }

  /**
   * A Story level finished (the Story game's report, which the chain's Story will send in step 3): 5 XP per star earned the first
   * time (`storyXp`), a chest on 3 stars the first time, its rank by the level's place in its campaign (`storyChestRank`),
   * outside the daily cap.
   */
  async reportStory(account: string, { campaign, level, stars }: StoryReport): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (p, v2, hash) => {
      const levels = CAMPAIGNS.find((c) => c.id === campaign)?.levels.length ?? 0;
      if (!Number.isInteger(level) || level < 1 || level > levels || !Number.isInteger(stars) || stars < 0 || stars > 3) throw new V2RefusedError("no-level", hash);
      const key = `${campaign}:${level}`;
      const best = v2.story[key] ?? 0;
      const xp = addXp(v2.xp, storyXp(best, stars));
      v2.xp = xp.xp;
      const chest = storyChestRank(level, levels, best, stars);
      if (chest) v2.chests.pending.push({ rank: chest, league: this.leagueOf(p), origin: { source: "story" } });
      v2.story[key] = Math.max(best, stars);
      return [this.event("StoryReported", { playerId: account, campaign, level, stars, xp: xp.gained, chest: chest ?? "" })];
    });
  }

  /**
   * Draws an opponent among PvP v2's rivals as `Matchmaker` does: `search` (free) or `next` (a Cobble), among the three nearest
   * the attacker's crowns that are not shielded.
   */
  async drawOpponentV2(account: string, kind: "search" | "next"): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (p, v2, hash) => {
      if (!v2.layout) throw new V2RefusedError("not-joined", hash);
      if (v2.attacks.at(-1)?.status === "open") throw new V2RefusedError("attack-started", hash);
      const now = Math.floor(this.now());
      const shielded = (address: string) => (this.state.rivalShields?.[addressKey(address)] ?? 0) > now;
      if (kind === "search" && v2.match && !shielded(v2.match.opponent)) throw new V2RefusedError("opponent-drawn", hash);
      if (kind === "next" && !v2.match) throw new V2RefusedError("nothing-drawn", hash);
      const events: DecodedEvent[] = kind === "search" ? this.answerV2(account, p, v2) : [];
      if (kind === "next") {
        if (p.cobbles < NEXT_PRICE) throw new V2RefusedError("not-enough-cobbles", hash);
        p.cobbles -= NEXT_PRICE;
        events.push(this.event("CobblesSpent", { playerId: account, spender: MOCK_MATCHMAKER, reason: "MATCH_NEXT", cobbles: NEXT_PRICE, balance: p.cobbles }));
      }
      const crowns = p.pvp?.crowns ?? 0;
      const current = v2.match ? BigInt(v2.match.opponent) : -1n;
      const pool = mockRivalsV2()
        .filter((r) => !shielded(r.address) && BigInt(r.address) !== current)
        .sort((a, b) => Math.abs(a.crowns - crowns) - Math.abs(b.crowns - crowns))
        .slice(0, 3);
      if (pool.length === 0) throw new V2RefusedError("no-opponent", hash);
      const rival = pool[Number(poseidon(MATCH_DRAW_V2, BigInt(account), BigInt(v2.draws)) % BigInt(pool.length))]!;
      const offer = offerOf(crowns, rival.crowns);
      const cost = costOf(crowns, rival.crowns);
      events.push(this.event("OpponentDrawn", { attacker: account, opponent: rival.address, offer, cost, drawIndex: v2.draws, paid: kind === "next" }));
      v2.draws += 1;
      v2.match = { opponent: rival.address, offer, cost };
      return events;
    });
  }

  /** Starts the attack on the opponent drawn: its deck drawn (`attackDeck`, ceil(1.15 x S)); the attacker's shield dropped, the rival's up. */
  async startAttackV2(account: string): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (p, v2, hash) => {
      if (v2.attacks.at(-1)?.status === "open") throw new V2RefusedError("attack-open", hash);
      const rival = v2.match ? mockRivalV2(v2.match.opponent) : null;
      if (!v2.match || !rival) throw new V2RefusedError("nothing-drawn", hash);
      const now = Math.floor(this.now());
      const key = addressKey(rival.address);
      if ((this.state.rivalShields?.[key] ?? 0) > now) throw new V2RefusedError("opponent-shielded", hash);
      const id = v2.attacks.length + 1;
      const deck = attackDeck(rival.tiles.map((t) => t.plan), rival.slots, poseidon(ATTACK_DRAW_V2, BigInt(account), BigInt(id)));
      v2.attacks.push({
        id,
        status: "open",
        defender: rival.address,
        slots: rival.slots,
        target: rival.score,
        // The snapshot (#786): the defender's layout as the attack found it.
        village: rival.tiles.map((t) => ({ ...t })),
        offer: v2.match.offer,
        cost: v2.match.cost,
        deck,
        moves: [],
        openedAt: now,
        score: 0,
        stars: 0,
        xp: 0,
        chest: null,
        gained: 0,
        lost: 0,
        finishedAt: 0,
      });
      (p.pvp ??= freshPvp()).shieldUntil = 0;
      this.state.rivalShields = { ...this.state.rivalShields, [key]: now + SHIELD_S };
      return [this.event("AttackOpened", { attacker: account, defender: rival.address, id, npc: false, offer: v2.match.offer, target: rival.score, tiles: deck.length, view: deck.slice(0, 3).join(",") })];
    });
  }

  /** Plays the tile in hand (checked on game-core's `QueuedAttack`); the deck's last tile ends the attack. */
  async playAttackV2(account: string, move: QueuedMove): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (p, v2, hash) => {
      const a = v2.attacks.at(-1);
      if (!a || a.status !== "open") throw new V2RefusedError("no-attack", hash);
      const attack = QueuedAttack.replay(a.deck, a.moves);
      const plan = attack.hand!;
      if (!move.discard && attack.refusal(move.orientation, move.cell) !== null) throw new V2RefusedError("cannot-place", hash);
      const played = move.discard ? { discard: true as const } : { discard: false as const, orientation: move.orientation, cell: { x: move.cell.x, y: move.cell.y } };
      attack.apply(played);
      a.moves.push({ ...played, plan });
      a.score = attack.score;
      const events = [this.event("AttackPlayed", { attacker: account, id: a.id, index: a.moves.length - 1, plan, discard: move.discard, score: attack.score, view: attack.view.join(",") })];
      return attack.over ? [...events, ...this.finishV2(account, p, v2, a, attack.score, false)] : events;
    });
  }

  /** Ends the open attack at 0 stars. */
  async surrenderAttackV2(account: string): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (p, v2, hash) => {
      const a = v2.attacks.at(-1);
      if (!a || a.status !== "open") throw new V2RefusedError("no-attack", hash);
      return this.finishV2(account, p, v2, a, a.score, true);
    });
  }

  /** The free village founded on `v2` (not founded yet): the address's starter layout, its tiles into the inventory. */
  private foundV2(account: string, v2: StoredV2): DecodedEvent[] {
    const layout = starterLayout(BigInt(account));
    const added = inventoryOf(layout.map((t) => t.plan));
    v2.inventory = v2.inventory.map((n, i) => n + added[i]!);
    v2.layout = layout;
    return [this.event("FreeVillageFounded", { playerId: account, tiles: layout.length, score: layoutScore(layout) })];
  }

  /** A v2 write: `change` works on the player's copy and their v2 state (created on the first write). */
  private writeV2(account: string, change: (player: StoredPlayer, v2: StoredV2, hash: string) => DecodedEvent[]): Promise<WriteResult> {
    return this.write(account, (p, hash) => change(p, (p.v2 ??= freshV2()), hash));
  }

  /** A player's league, from their crowns. */
  private leagueOf(p: StoredPlayer): number {
    return leagueIndex(p.pvp?.crowns ?? 0);
  }

  /** An attack as `attackV2` shows it: the deck only as far as the tile in hand and the next two. */
  /**
   * The day's PvP slot an attack's chest fills: the one recorded at its end, or, for an attack saved before it was recorded, the
   * count of the earlier attacks that won a chest the same UTC day. `finishV2` alone grants PvP chests, one slot after the other,
   * and one attack is open at a time, so the record's order is the grants' order. Null with no chest.
   */
  private chestSlotOf(a: StoredAttackV2, attacks: readonly StoredAttackV2[]): number | null {
    if (!a.chest) return null;
    if (a.chestSlot !== undefined) return a.chestSlot;
    const day = dayOf(a.finishedAt);
    let slot = 0;
    for (const x of attacks) {
      if (x === a) return slot;
      if (x.chest && x.status !== "open" && dayOf(x.finishedAt) === day) slot++;
    }
    return slot;
  }

  private attackView(a: StoredAttackV2, attacks: readonly StoredAttackV2[]): AttackV2 {
    const open = a.status === "open";
    return {
      id: a.id,
      status: a.status,
      defender: a.defender,
      slots: a.slots,
      target: a.target,
      deck: a.deck.length,
      view: open ? a.deck.slice(a.moves.length, a.moves.length + 3) : [],
      moves: a.moves.map((m) => (m.discard ? { ...m } : { ...m, cell: { ...m.cell } })),
      score: a.score,
      stars: a.stars,
      xp: a.xp,
      chest: a.chest,
      chestSlot: this.chestSlotOf(a, attacks),
      gained: a.gained,
      lost: a.lost,
      openedAt: a.openedAt,
      finishedAt: a.finishedAt,
    };
  }

  /**
   * A rival's answer (#786): the mock's rivals live on no device, so the rival the player attacked last attacks the player's
   * village at their next search, once per attack. The snapshot is the layout saved then; the deck is drawn from it as an attack
   * on a rival's is (`attackDeck`, ceil(1.15 x S)), played by a plain player (the most points now, else a discard). The player
   * loses the crowns its stars win, or wins its cost when it takes none, and the village is shielded for 8 hours (`SHIELD_S`), as
   * any attacked village is: until the player starts an attack, which drops it, or the shield ends.
   */
  private answerV2(account: string, p: StoredPlayer, v2: StoredV2): DecodedEvent[] {
    const last = v2.attacks.at(-1);
    const rival = last ? mockRivalV2(last.defender) : null;
    if (!last || !rival || last.status === "open" || !v2.layout || (v2.answered ?? 0) >= last.id) return [];
    v2.answered = last.id;
    const village = v2.layout.map((t) => ({ ...t }));
    const target = layoutScore(village);
    const { slots } = levelStatus(v2.xp);
    const id = (v2.defences?.length ?? 0) + 1;
    const deck = attackDeck(village.map((t) => t.plan), slots, poseidon(DEFENCE_DRAW_V2, BigInt(account), BigInt(id)));
    const attack = new QueuedAttack(deck);
    const moves: StoredDefenceV2["moves"] = [];
    while (!attack.over) {
      const plan = attack.hand!;
      const move = plainMove(attack, plan);
      attack.apply(move);
      moves.push({ ...move, plan });
    }
    const stars = attackStars(attack.score, target);
    const pvp = (p.pvp ??= freshPvp());
    const stakes = stakesOf(offerOf(rival.crowns, pvp.crowns), costOf(rival.crowns, pvp.crowns));
    const crowns = stars > 0 ? -Math.min(stakes.win[stars - 1]!, pvp.crowns) : stakes.loss;
    pvp.crowns += crowns;
    const finishedAt = Math.floor(this.now());
    pvp.shieldUntil = finishedAt + SHIELD_S;
    (v2.defences ??= []).push({ id, attacker: rival.address, slots, village, target, deck, moves, score: attack.score, stars, crowns, finishedAt });
    return [this.event("DefenceFinished", { attacker: rival.address, defender: account, id, score: attack.score, stars, crowns })];
  }

  /** A v2 attack's end: its stars (`attackStars`), the crowns, the XP (`pvpXp`, stopped at the cap) and a chest within the day's cap. */
  private finishV2(account: string, p: StoredPlayer, v2: StoredV2, a: StoredAttackV2, score: number, surrendered: boolean): DecodedEvent[] {
    const stars = surrendered ? 0 : attackStars(score, a.target);
    const { gained, lost } = this.settle(p, stars, a.offer, a.cost);
    v2.match = null;
    const xp = addXp(v2.xp, pvpXp(stars));
    v2.xp = xp.xp;
    const today = dayOf(this.now());
    const rank = pvpChestRank(stars);
    const slot = v2.pvpChests[today] ?? 0;
    const granted = rank !== null && pvpChestGranted(slot);
    if (granted) {
      v2.chests.pending.push({ rank, league: this.leagueOf(p), origin: { source: "pvp", day: today, slot } });
      v2.pvpChests = { [today]: slot + 1 };
    }
    countTutorial(p, "attack-settled");
    if (stars > 0) countTutorial(p, "attack-won");
    Object.assign(a, { status: surrendered ? "surrendered" : "finished", score, stars, xp: xp.gained, chest: granted ? rank : null, ...(granted && { chestSlot: slot }), gained, lost, finishedAt: Math.floor(this.now()) });
    return [this.event("AttackFinished", { attacker: account, defender: a.defender, id: a.id, score, stars, surrendered, gained, lost, xp: xp.gained, chest: granted ? rank : "" })];
  }
}
