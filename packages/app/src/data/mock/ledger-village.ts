import { REWARD_COBBLES, VillageRefusedError, WriteError, tierOf, type BuyParcelRequest, type RewardClaim, type RewardGrants, type RewardOffer, type VillageCell, type VillageInfo, type VillageTile, type WriteResult } from "@paved/chain";
import { offerPlans, parcelLevel, parcelPrice, placeInVillage, poseidon, startTerritory, villageGame, villageRefusal } from "@paved/game-core";
import { mockRival } from "./pvp";
import { MOCK_MAX_CELLS, STARTER, REWARD_DRAW, PLACE_REFUSALS, type StoredPlayer, freshRewards, sleep } from "./ledger-state";
import { LedgerQuests } from "./ledger-quests";

/** The village (PvP v1's): its cells and tiles, its parcels, and its rewards. One link of `MockLedger`'s chain (`ledger.ts`). */
export abstract class LedgerVillage extends LedgerQuests {
  /** `Village.village(player_id)`, as the contract computes it: the score is the engine's replay of the tiles (game-core). */
  async village(playerId: string): Promise<VillageInfo> {
    const rival = mockRival(playerId);
    if (rival) return { gameId: 1, cells: rival.cells.length, tiles: rival.tiles.length - 1, score: rival.score, nextParcel: 0, nextPrice: 0, nextLevel: 0 };
    this.sync();
    const v = this.peek(playerId).village;
    if (!v) return { gameId: 0, cells: 0, tiles: 0, score: 0, nextParcel: 1, nextPrice: parcelPrice(1), nextLevel: parcelLevel(1) };
    const cells = startTerritory().length + v.parcels.length;
    const parcel = cells >= MOCK_MAX_CELLS ? 0 : v.parcels.length + 1;
    return {
      gameId: 1,
      cells,
      tiles: v.tiles.length,
      score: this.engine(v).score,
      nextParcel: parcel,
      nextPrice: parcelPrice(parcel),
      nextLevel: parcelLevel(parcel),
    };
  }

  async villageCells(playerId: string): Promise<VillageCell[]> {
    const rival = mockRival(playerId);
    if (rival) return rival.cells.map((c) => ({ ...c }));
    this.sync();
    const v = this.peek(playerId).village;
    return v ? [...startTerritory(), ...v.parcels].map((c) => ({ x: c.x, y: c.y })) : [];
  }

  async villageTiles(playerId: string): Promise<VillageTile[]> {
    const rival = mockRival(playerId);
    if (rival) return rival.tiles.map((t) => ({ ...t }));
    this.sync();
    const v = this.peek(playerId).village;
    return v ? this.tilesOf(v) : [];
  }

  async villageMaxCells(): Promise<number> {
    return MOCK_MAX_CELLS;
  }

  async rewardGrants(playerId: string): Promise<RewardGrants> {
    this.sync();
    const r = this.peek(playerId).rewards ?? freshRewards();
    return { day: Math.floor(Date.now() / 86_400_000), today: 0, pending: r.pending, opened: r.opened };
  }

  async rewardOffer(playerId: string): Promise<RewardOffer> {
    this.sync();
    const r = this.peek(playerId).rewards ?? freshRewards();
    return r.offer ? { index: r.index, plans: [...r.offer] } : { index: 0, plans: [0, 0, 0] };
  }

  async planCopies(playerId: string): Promise<number[]> {
    this.sync();
    return [...(this.peek(playerId).rewards ?? freshRewards()).copies];
  }

  /** `Village.found()`: the 3 x 3 of the start and the starter, once. */
  async foundVillage(account: string): Promise<WriteResult> {
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      if (p.village) throw new VillageRefusedError("founded", hash);
      p.village = { parcels: [], tiles: [] };
      return [this.event("VillageFounded", { playerId: account, gameId: 1 })];
    });
  }

  /**
   * `Village.buy_parcel(x, y)`, after the writer's check of the confirmed price: a village, the cell not owned, next to an owned
   * one, under the cap, the level (the mock's, `playerLevel`: no XP, level 1) at least the parcel's, then the Cobbles.
   */
  async buyParcel(account: string, { cell, confirmedPrice }: BuyParcelRequest): Promise<WriteResult> {
    if (!Number.isInteger(confirmedPrice) || confirmedPrice <= 0) throw new WriteError("No confirmed price for this parcel: nothing was sent");
    const price = (await this.village(account)).nextPrice;
    if (price !== confirmedPrice) throw new VillageRefusedError("price-changed");
    const level = (await this.playerLevel(account)).level;
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      const v = p.village;
      if (!v) throw new VillageRefusedError("no-village", hash);
      const owned = [...startTerritory(), ...v.parcels];
      const has = (x: number, y: number) => owned.some((c) => c.x === x && c.y === y);
      if (has(cell.x, cell.y)) throw new VillageRefusedError("cell-owned", hash);
      if (![[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => has(cell.x + dx!, cell.y + dy!))) throw new VillageRefusedError("not-adjacent", hash);
      if (owned.length >= MOCK_MAX_CELLS) throw new VillageRefusedError("territory-full", hash);
      const parcel = v.parcels.length + 1;
      if (level < parcelLevel(parcel)) throw new VillageRefusedError("level-too-low", hash);
      const cost = parcelPrice(parcel);
      if (p.cobbles < cost) throw new VillageRefusedError("not-enough-cobbles", hash);
      p.cobbles -= cost;
      v.parcels.push({ x: cell.x, y: cell.y });
      return [this.event("ParcelBought", { playerId: account, parcel, x: cell.x, y: cell.y, cells: owned.length + 1, cobbles: cost, level })];
    });
  }

  /** `Rewards.open_reward()`: the next pending reward's 3 tiles, drawn from the base deck as `offer_plans` (a Poseidon stands in for the VRF). */
  async openReward(account: string): Promise<WriteResult> {
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      const r = (p.rewards ??= freshRewards());
      if (r.offer) throw new VillageRefusedError("offer-open", hash);
      if (r.pending === 0) throw new VillageRefusedError("no-reward", hash);
      const plans = offerPlans(poseidon(REWARD_DRAW, BigInt(account), BigInt(r.opened)));
      r.pending -= 1;
      r.opened += 1;
      r.index = r.opened;
      r.offer = plans;
      return [this.event("RewardOpened", { playerId: account, index: r.index, plan1: plans[0], plan2: plans[1], plan3: plans[2] })];
    });
  }

  /** `Rewards.claim_reward(...)`: the open offer placed (every rule of `Village.place`, on game-core's engine), merged, or the Cobbles. */
  async claimReward(account: string, claim: RewardClaim): Promise<WriteResult> {
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      const r = (p.rewards ??= freshRewards());
      if (!r.offer) throw new VillageRefusedError("no-offer", hash);
      const index = r.index;
      if (claim.choice === "cobbles") {
        r.offer = null;
        p.cobbles += REWARD_COBBLES;
        return [this.event("RewardClaimed", { playerId: account, index, choice: 3, plan: 0, copies: 0, tier: 0, cobbles: REWARD_COBBLES })];
      }
      const plan = r.offer[claim.slot];
      if (plan === undefined) throw new WriteError(`Not an offer slot: ${claim.slot}`);
      if (claim.choice === "place") {
        const v = p.village;
        if (!v) throw new VillageRefusedError("no-village", hash);
        const game = this.engine(v);
        const refused = villageRefusal(game, plan, claim.orientation, claim.cell);
        if (refused) throw new VillageRefusedError(PLACE_REFUSALS[refused] ?? "cannot-place", hash);
        placeInVillage(game, plan, claim.orientation, claim.cell);
        v.tiles.push({ plan, orientation: claim.orientation, x: claim.cell.x, y: claim.cell.y });
      }
      r.offer = null;
      r.copies[plan - 1] = (r.copies[plan - 1] ?? 0) + 1;
      const copies = r.copies[plan - 1]!;
      return [this.event("RewardClaimed", { playerId: account, index, choice: claim.choice === "place" ? 1 : 2, plan, copies, tier: tierOf(copies), cobbles: 0 })];
    });
  }

  /** A stored village's tiles as `Village.tiles` lists them: the starter first, then the tiles placed, ids 2 on. */
  private tilesOf(v: NonNullable<StoredPlayer["village"]>): VillageTile[] {
    return [{ ...STARTER }, ...v.tiles.map((t, i) => ({ id: i + 2, ...t }))];
  }

  /** A stored village on game-core's engine. */
  private engine(v: NonNullable<StoredPlayer["village"]>) {
    return villageGame([...startTerritory(), ...v.parcels], this.tilesOf(v), MOCK_MAX_CELLS);
  }
}
