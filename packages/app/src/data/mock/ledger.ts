import { PackNotOnSaleError, PackPriceChangedError, WriteError, type PackBought, type PackPurchaseRequest, type PackView, type PlayerReferrals } from "@paved/chain";
import { forgetFollows } from "./follows";
import { PACKS } from "../../mocks/cobbles";
import { addressKey } from "../keys";
import * as chat from "./chat";
import { type PackReceipt, type MockedWrites, fresh, sleep } from "./ledger-state";
import { LedgerPvpV2 } from "./ledger-pvp-v2";

// The mock ledger (#549, MOCK-FIRST): the reads and writes the deployed classes lack, served on the device, behind the same
// interfaces as the chain path (`MockedReads`: `@paved/chain`'s `CobbleViews`, `PackViews`, `SkinViews`, `VaultViews` and
// the parts of `GameViews` and `EconomyViews` that are missing; `MockedWrites`: the writer's claims, skin writes, the pack
// purchase, the Vault's writes and the faucet), and the Challenge's games with the Economy's purchase and settlement (#927,
// `challenge.ts`: game-core's rules, a seeded random in place of the VRF's). It holds state and the contracts' rules only: it reads nothing from the chain,
// the tokens' balances included (USDC, PAVED and the Vault's vPAVED are the ledger's, #927). The overlays (`overlay.ts`) wire
// it in place of the chain's entry points. Its figures are the specs' (cobbles-v1.md, quests-v2.md, vault-share.md); its state is kept on the
// device (`MOCK_KEY`), so a flow (claim, buy, set, deposit, withdraw) completes and survives a reload.
//
// The class is a chain of one class per domain, each in its own file (`ledger-core.ts` first, then `ledger-player.ts`,
// `ledger-quests.ts`, `ledger-village.ts`, `ledger-social.ts`, `ledger-guilds.ts`, `ledger-chat.ts`, `ledger-puzzle.ts`,
// `ledger-vault.ts`, `ledger-challenge.ts`, `ledger-pvp.ts`, `ledger-pvp-v2.ts`); the state's types and helpers are
// `ledger-state.ts`'s.

export { MOCK_KEY, MOCK_LATENCY_MS, MOCK_STARTING_BALANCES, MOCK_VAULT, MOCK_SPLIT, MOCK_SKIN_THEMES, MOCK_MAX_CELLS, MOCK_STARTING_REWARDS, MOCK_SKIN_TIERS, mockLock } from "./ledger-state";
export type { TokenBalances, MockedReads, PackReceipt, MockedWrites, MockChatSource, NewPlayerCatalogue, MockLedgerOptions, MockLock } from "./ledger-state";

/**
 * The mock ledger: the reads of `MockedReads` (the PAVED and USDC balances its own) and,
 * for an account, the writes of `MockedWrites` (`writesFor`). Each write checks what the contract checks, refuses with the
 * chain path's typed error, and answers a receipt with the contract's events, so the hooks' `apply*Events` read it as they
 * read the chain's. The claims trust the page for completion: the progress is the indexer's (it works), and the page offers
 * a claim only for a completed quest or achievement.
 */
export class MockLedger extends LedgerPvpV2 {
  /** The time of the mock's indexer: the ledger's clock, in whole seconds (its head's block time). */
  seconds(): number {
    return this.second();
  }

  /** Whether `playerId` is an account of the device: it wrote to the ledger at least once. */
  knows(playerId: string): boolean {
    this.sync();
    return addressKey(playerId) in this.state.players;
  }

  /** `/v1/players/:id/referrals`: the mock's player referred nobody yet. */
  referrals(playerId: string): PlayerReferrals {
    return { playerId: addressKey(playerId), total: "0", games: { count: 0, total: "0" }, packs: { count: 0, total: "0" } };
  }

  async pack(packId: number): Promise<PackView> {
    return { ...(PACKS.find((p) => p.packId === packId) ?? { packId, cobbles: 0, price: 0n, active: false }) };
  }

  /** The writes of `account`: a deposit or a pack is refused for a balance the account does not hold in the ledger. */
  writesFor(account: string): MockedWrites {
    return {
      claimQuest: (questId, period) => this.claim(account, [{ kind: "quest", questId, period }]),
      claimAchievement: (achievementId) => this.claim(account, [{ kind: "achievement", achievementId }]),
      claimDailyCredit: (day) => this.claim(account, [{ kind: "credit", credit: "daily", period: day }]),
      claimWeeklyCredit: (week) => this.claim(account, [{ kind: "credit", credit: "weekly", period: week }]),
      claimDailyMilestone: (day, step) => this.claimDailyMilestone(account, day, step),
      claimWeeklyMilestone: (week, step) => this.claimWeeklyMilestone(account, week, step),
      claimTutorialStep: (id) => this.claimTutorialStep(account, id),
      claimTutorial: () => this.claimTutorial(account),
      claim: (claims) => this.claim(account, claims),
      buySkin: (request) => this.buySkin(account, request),
      setSkins: (changes) => this.setSkins(account, changes),
      buyAvatarItem: (request) => this.buyAvatarItem(account, request),
      setAvatar: (look) => this.setAvatar(account, look),
      setName: (name) => this.setName(account, name),
      rename: (request) => this.rename(account, request),
      foundVillage: () => this.foundVillage(account),
      buyParcel: (request) => this.buyParcel(account, request),
      openReward: () => this.openReward(account),
      claimReward: (claim) => this.claimReward(account, claim),
      drawOpponent: (kind) => this.drawOpponent(account, kind),
      startAttack: () => this.startAttack(account),
      playAttack: (play) => this.playAttack(account, play),
      surrenderAttack: () => this.surrenderAttack(account),
      foundFreeVillage: () => this.foundFreeVillage(account),
      saveLayout: (tiles) => this.saveLayout(account, tiles),
      saveLayoutTo: (slot, tiles) => this.saveLayoutTo(account, slot, tiles),
      activateLayout: (slot) => this.activateLayout(account, slot),
      buyLayoutSlot: (request) => this.buyLayoutSlot(account, request),
      openChest: (index) => this.openChest(account, index),
      claimChest: (slot) => this.claimChest(account, slot),
      buyTile: (request) => this.buyTile(account, request),
      reportStory: (report) => this.reportStory(account, report),
      drawOpponentV2: (kind) => this.drawOpponentV2(account, kind),
      startAttackV2: () => this.startAttackV2(account),
      playAttackV2: (move) => this.playAttackV2(account, move),
      surrenderAttackV2: () => this.surrenderAttackV2(account),
      buyPack: (request) => this.buyPack(account, request),
      mint: () => this.mint(account),
      purchase: (request) => this.purchase(account, request),
      spawnFree: () => this.spawnFree(account),
      build: (key, move) => this.playOn(account, key, { kind: "build", orientation: move.orientation, x: move.x, y: move.y }),
      discard: (key) => this.playOn(account, key, { kind: "discard" }),
      surrender: (key) => this.playOn(account, key, { kind: "surrender" }),
      settle: (gameIds) => this.settleGames(account, gameIds),
      deposit: (amount, options) => this.deposit(account, amount, options),
      withdraw: (amount, options) => this.withdraw(account, amount, options),
      withdrawAll: (options) => this.withdrawAll(account, options),
      vaultMint: (shares, options) => this.vaultMint(account, shares, options),
      vaultRedeem: (shares, options) => this.vaultRedeem(account, shares, options),
    };
  }

  /**
   * `Setup.buy_pack`: the pack on sale at the confirmed price (`PackBuyer`'s checks), paid from the player's USDC, its Cobbles
   * added. The pool and the referral are not run: no PAVED is burned.
   */
  async buyPack(account: string, request: PackPurchaseRequest): Promise<PackReceipt> {
    const pack = await this.pack(request.packId);
    if (!(pack.active && pack.cobbles > 0 && pack.price > 0n)) throw new PackNotOnSaleError(request.packId);
    if (request.confirmedPrice !== pack.price) throw new PackPriceChangedError(request.confirmedPrice, pack.price);
    const short = () => new WriteError("Not enough USDC for this pack: get test USDC first. Nothing was sent.");
    if ((await this.usdcBalance(account)) < pack.price) throw short();
    await sleep(this.latency);
    let bought: PackBought | null = null;
    const result = await this.write(account, (p) => {
      // Checked again at commit: another purchase may have spent the USDC during the wait.
      if (BigInt(p.usdc) < pack.price) throw short();
      p.cobbles += pack.cobbles;
      p.usdc = (BigInt(p.usdc) - pack.price).toString();
      bought = { playerId: addressKey(account), packId: pack.packId, cobbles: pack.cobbles, price: pack.price, referrer: "0x0", balance: p.cobbles };
      return [this.event("PackBought", { ...bought })];
    });
    return { ...result, bought: bought! };
  }

  /**
   * Forgets an account (#927, Settings' Reset on the mock): its record goes, with everything it held, and its Vault shares
   * leave the Vault with their value, so the share's price stays as it was for the others. No latency: the wallet's own step,
   * not a write the player sends. Resolves true when the ledger held the account.
   */
  async forget(account: string): Promise<boolean> {
    return this.lock(() => {
      this.sync();
      const key = addressKey(account);
      const player = this.state.players[key];
      if (!player) return false;
      const shares = BigInt(player.shares);
      if (shares > 0n) {
        const t = this.totals();
        this.state.vault = { assets: (t.assets - this.toAssets(shares)).toString(), supply: (t.supply - shares).toString() };
      }
      const players = { ...this.state.players };
      delete players[key];
      // Its games go too: the next account of the key has none in play.
      const challenge = this.state.challenge && { ...this.state.challenge, games: Object.fromEntries(Object.entries(this.state.challenge.games).filter(([, g]) => g.player !== key)) };
      // Its follows and blocks go too (#954), and those of it; and its messages (#955).
      const follows = this.state.follows && forgetFollows(this.state.follows, key);
      const chatState = this.state.chat && chat.forgetChat(this.state.chat, key);
      this.state = { ...this.state, players, ...(challenge ? { challenge } : {}), ...(follows ? { follows } : {}), ...(chatState ? { chat: chatState } : {}) };
      this.save();
      return true;
    });
  }

  /** Back to the mock's start: nothing claimed, bought or deposited. */
  reset(): Promise<void> {
    return this.lock(() => {
      this.state = fresh();
      this.save();
    });
  }
}
