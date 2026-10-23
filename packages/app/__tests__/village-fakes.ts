import { VillageRefusedError, tierOf, type BuyParcelRequest, type DecodedEvent, type FakeGameViews, type RewardClaim, type VillageViews, type WriteResult } from "@paved/chain";
import { offerPlans, parcelLevel, parcelPrice, placeInVillage, startTerritory, villageGame, villageRefusal } from "@paved/game-core";

const event = (name: string, fields: Record<string, unknown>): DecodedEvent => ({ name, fields }) as unknown as DecodedEvent;

/** The starter `Village.found` writes. */
const STARTER = { id: 1, plan: 9, orientation: 3, x: 0, y: 0 };

/**
 * `Village`'s and `Rewards`' writes in memory, on the fake views (#646): `found`, `buy_parcel`, `open_reward` and `claim_reward`
 * with the contracts' checks, the placement on game-core's engine. `level` is the player's level the parcel's gate reads.
 */
export class FakeVillageWriter {
  readonly sent: string[] = [];
  /** While set, a write waits for it before answering: the page's pending state. */
  gate: Promise<void> | null = null;
  level = 1;
  constructor(
    readonly views: FakeGameViews,
    readonly address: string,
  ) {}

  private get player() {
    return this.views.villagePlayer(this.address);
  }

  private refresh(): void {
    const v = this.player;
    const cells = v.cells.length;
    const parcel = cells >= this.views.villageCap ? 0 : cells - 8;
    const score = villageGame(v.cells, v.tiles, this.views.villageCap).score;
    v.info = { gameId: 1, cells, tiles: v.tiles.length - 1, score, nextParcel: parcel, nextPrice: parcelPrice(parcel), nextLevel: parcelLevel(parcel) };
  }

  async foundVillage(): Promise<WriteResult> {
    if (this.gate) await this.gate;
    this.sent.push("found");
    const v = this.player;
    if (v.info.gameId !== 0) throw new VillageRefusedError("founded", "0x1");
    v.cells = startTerritory();
    v.tiles = [{ ...STARTER }];
    this.refresh();
    return { transactionHash: "0x1", events: [event("VillageFounded", { playerId: this.address, gameId: 1 })] };
  }

  async buyParcel({ cell, confirmedPrice }: BuyParcelRequest, views: Pick<VillageViews, "village">): Promise<WriteResult> {
    if (this.gate) await this.gate;
    const price = (await views.village(this.address)).nextPrice;
    if (price !== confirmedPrice) throw new VillageRefusedError("price-changed");
    this.sent.push(`parcel ${cell.x},${cell.y}`);
    const v = this.player;
    if (v.info.gameId === 0) throw new VillageRefusedError("no-village", "0x2");
    if (this.level < v.info.nextLevel) throw new VillageRefusedError("level-too-low", "0x2");
    const ledger = this.views.cobblePlayer(this.address);
    if (ledger.account.cobbles < price) throw new VillageRefusedError("not-enough-cobbles", "0x2");
    ledger.account = { ...ledger.account, cobbles: ledger.account.cobbles - price };
    v.cells = [...v.cells, cell];
    this.refresh();
    return { transactionHash: "0x2", events: [event("ParcelBought", { playerId: this.address, parcel: v.cells.length - 9, x: cell.x, y: cell.y })] };
  }

  async openReward(views: Pick<VillageViews, "rewardGrants">): Promise<WriteResult> {
    if (this.gate) await this.gate;
    const { opened } = await views.rewardGrants(this.address);
    this.sent.push(`open ${opened}`);
    const v = this.player;
    if (v.offer.plans[0] !== 0) throw new VillageRefusedError("offer-open", "0x3");
    if (v.grants.pending === 0) throw new VillageRefusedError("no-reward", "0x3");
    const plans = offerPlans(BigInt(opened) * 0x10000000000000001n + 3n);
    v.grants = { ...v.grants, pending: v.grants.pending - 1, opened: opened + 1 };
    v.offer = { index: opened + 1, plans };
    return { transactionHash: "0x3", events: [event("RewardOpened", { playerId: this.address, index: opened + 1, plan1: plans[0], plan2: plans[1], plan3: plans[2] })] };
  }

  async claimReward(claim: RewardClaim): Promise<WriteResult> {
    if (this.gate) await this.gate;
    this.sent.push(`claim ${claim.choice}`);
    const v = this.player;
    if (v.offer.plans[0] === 0) throw new VillageRefusedError("no-offer", "0x4");
    const index = v.offer.index;
    if (claim.choice === "cobbles") {
      const ledger = this.views.cobblePlayer(this.address);
      ledger.account = { ...ledger.account, cobbles: ledger.account.cobbles + 5 };
      v.offer = { index: 0, plans: [0, 0, 0] };
      return { transactionHash: "0x4", events: [event("RewardClaimed", { playerId: this.address, index, choice: 3, plan: 0, copies: 0, tier: 0, cobbles: 5 })] };
    }
    const plan = v.offer.plans[claim.slot]!;
    if (claim.choice === "place") {
      const game = villageGame(v.cells, v.tiles, this.views.villageCap);
      const refused = villageRefusal(game, plan, claim.orientation, claim.cell);
      if (refused === "Tile: cannot place") throw new VillageRefusedError("cannot-place", "0x4");
      if (refused) throw new VillageRefusedError("no-neighbors", "0x4");
      placeInVillage(game, plan, claim.orientation, claim.cell);
      v.tiles = [...v.tiles, { id: v.tiles.length + 1, plan, orientation: claim.orientation, ...claim.cell }];
      this.refresh();
    }
    v.copies[plan - 1] = (v.copies[plan - 1] ?? 0) + 1;
    v.offer = { index: 0, plans: [0, 0, 0] };
    const copies = v.copies[plan - 1]!;
    return { transactionHash: "0x4", events: [event("RewardClaimed", { playerId: this.address, index, choice: claim.choice === "place" ? 1 : 2, plan, copies, tier: tierOf(copies), cobbles: 0 })] };
  }
}
