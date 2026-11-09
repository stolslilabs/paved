import { AvatarPriceChangedError, AvatarRefusedError, RenameRefusedError, isPlayerName, nameKey, SKIN_PLANS, SkinPriceChangedError, SkinRefusedError, WriteError, tierOf, type AvatarItem, type BuyAvatarItemRequest, type RenameRequest, type BuySkinRequest, type CobbleAccount, type DecodedEvent, type PlayerLevel, type SkinChange, type WriteResult } from "@paved/chain";
import { levelStatus } from "@paved/game-core";
import { mockRival, mockRivals } from "./pvp";
import { seededPlayer } from "./players";
import { community, levelAt } from "./community";
import { mockRivalV2 } from "./v2";
import { AVATAR_ITEMS, AVATAR_PARTS_IN_USE, AVATAR_PRICE_BOUNDS, AVATAR_RENAME_PRICE, generatedLook } from "../../mocks/avatar";
import { addressKey } from "../keys";
import { PLAYER_NAME_MAX } from "../../lib/name-limit";
import { MOCK_SKIN_THEMES, MOCK_SKIN_TIERS, type StoredPlayer, freshRewards, type NewPlayerCatalogue, MOCK_NAME, bit, sleep, activeWord } from "./ledger-state";
import { LedgerCore } from "./ledger-core";

/** The player's reads and writes: its level and account, its skins, its avatar and its name. One link of `MockLedger`'s chain (`ledger.ts`). */
export abstract class LedgerPlayer extends LedgerCore {
  /**
   * `Setup.player_level` (#641) with PvP v2's XP (#741): the XP of the mock's attacks and Story reports, its level capped at 20
   * (game-core's `levelStatus`; at the cap `next` is the level's floor). The Challenge's games give no XP.
   */
  async playerLevel(playerId: string): Promise<PlayerLevel> {
    // A seeded player (`players.ts`) is at its level's floor.
    const seeded = seededPlayer(playerId);
    if (seeded) {
      const { xp, level, floor, next } = levelAt(seeded.level);
      return { xp, level, floor, next };
    }
    this.sync();
    const { xp, level, floor, next } = levelStatus(this.peek(playerId).v2?.xp ?? 0);
    return { xp, level, floor, next };
  }

  async account(playerId: string): Promise<CobbleAccount> {
    this.sync();
    const p = this.peek(playerId);
    return { cobbles: p.cobbles, credits: p.credits, games: 0, forests: 0, wonders: 0, big: 0, high: 0, achievementsClaimed: BigInt(p.achievementsClaimed), xp: 0 };
  }

  async skinPrice(theme: number, plan: number): Promise<number> {
    return MOCK_SKIN_THEMES.get(theme)?.[plan - 1] ?? 0;
  }

  async skinPrices(theme: number): Promise<number[]> {
    return Array.from({ length: SKIN_PLANS }, (_, i) => MOCK_SKIN_THEMES.get(theme)?.[i] ?? 0);
  }

  async ownedSkins(playerId: string, theme: number): Promise<number> {
    this.sync();
    return this.peek(playerId).owned[theme] ?? 0;
  }

  async activeSkins(playerId: string): Promise<number[]> {
    this.sync();
    return [...this.peek(playerId).active];
  }

  /** `Avatar.parts()`: the fresh deployment's nine (`mocks/avatar.ts`). */
  async avatarParts(): Promise<number> {
    return AVATAR_PARTS_IN_USE;
  }

  async avatarPriceBounds(): Promise<[number, number]> {
    return [...AVATAR_PRICE_BOUNDS];
  }

  async avatarItem(part: number, id: number): Promise<AvatarItem> {
    return { ...(AVATAR_ITEMS[part]?.[id] ?? { part, id, state: 0, cobbles: 0, sold: 0, supply: 0, until: 0 }) };
  }

  async avatarItems(part: number): Promise<AvatarItem[]> {
    return (AVATAR_ITEMS[part] ?? []).map((item) => ({ ...item }));
  }

  async ownedAvatarItems(playerId: string, part: number): Promise<bigint> {
    this.sync();
    return BigInt(this.peek(playerId).avatarOwned?.[part] ?? "0");
  }

  /** `Avatar.avatar(player_id)`: a rival of the mock saved none, so it wears the face its battle logs show (#834, #926). */
  async avatar(playerId: string): Promise<bigint> {
    if (mockRival(playerId) || mockRivalV2(playerId) || seededPlayer(playerId)) return generatedLook(playerId);
    this.sync();
    return BigInt(this.peek(playerId).avatar ?? "0");
  }

  /** The player's name (#926), null when they have none: a rival's is its own (`rivalName`). */
  async name(playerId: string): Promise<string | null> {
    const seeded = seededPlayer(playerId);
    if (seeded) return seeded.name;
    this.sync();
    return this.peek(playerId).name ?? null;
  }

  /** `Avatar.name(player_id)` (PLAYER-RENAME): the mock's name, drawn or chosen, as every screen of the mock shows it. */
  playerName(playerId: string): Promise<string | null> {
    return this.name(playerId);
  }

  /** `Avatar.renames(player_id)`: the changes made; the drawn name is not one. */
  async renameCount(playerId: string): Promise<number> {
    this.sync();
    return this.peek(playerId).renames ?? 0;
  }

  /** `Avatar.rename_price()`: `scripts/deploy.sh`'s (`AVATAR_RENAME_PRICE`). */
  async renamePrice(): Promise<number> {
    return AVATAR_RENAME_PRICE;
  }

  /**
   * `Avatar.name_owner(name)`: who holds `name` in any case among the names the mock shows, the players' of the ledger (drawn or
   * chosen), the seeded players', the community's and the rivals'; null: free, or not a name.
   */
  async nameOwner(name: string): Promise<string | null> {
    const key = nameKey(name);
    if (key === null) return null;
    this.sync();
    return this.holderOf(key);
  }

  /** The address holding the name of key `key` (`nameKey`: its case folded), or null. */
  private holderOf(key: string): string | null {
    const same = (name: string | undefined) => name !== undefined && nameKey(name) === key;
    for (const [address, p] of Object.entries(this.state.players)) if (same(p.name)) return address;
    const named = [...community(), ...mockRivals()].find((m) => same(m.name));
    return named ? named.address : null;
  }

  async skinTiers(theme: number): Promise<number[]> {
    const tiers = MOCK_SKIN_TIERS.get(theme) ?? {};
    return Array.from({ length: SKIN_PLANS }, (_, i) => tiers[i + 1] ?? 0);
  }

  /** `Setup.buy_skin(theme, plan)`, after the writer's checks: the confirmed price, then owned, then the balance. */
  async buySkin(account: string, { theme, plan, confirmedPrice }: BuySkinRequest): Promise<WriteResult> {
    if (!Number.isInteger(theme) || theme < 1 || theme > 255 || !Number.isInteger(plan) || plan < 1 || plan > SKIN_PLANS) throw new SkinRefusedError("invalid-skin");
    if (!Number.isInteger(confirmedPrice) || confirmedPrice <= 0) throw new WriteError("No confirmed price for this skin: nothing was sent");
    const price = await this.skinPrice(theme, plan);
    if (price !== confirmedPrice) throw new SkinPriceChangedError(confirmedPrice, price);
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      const owned = p.owned[theme] ?? 0;
      if ((owned >>> plan) & 1) throw new SkinRefusedError("owned", hash);
      if (p.cobbles < price) throw new SkinRefusedError("not-enough-cobbles", hash);
      const tier = MOCK_SKIN_TIERS.get(theme)?.[plan] ?? 0;
      if (tier > 0 && tierOf((p.rewards ?? freshRewards()).copies[plan - 1] ?? 0) < tier) throw new SkinRefusedError("tier-too-low", hash);
      p.owned[theme] = owned | (1 << plan);
      p.cobbles -= price;
      return [this.event("SkinBought", { playerId: account, theme, plan, price, balance: p.cobbles })];
    });
  }

  /** `Setup.set_skins(changes)`: theme 0 always passes, another only when owned; the whole batch or nothing. */
  async setSkins(account: string, changes: readonly SkinChange[]): Promise<WriteResult> {
    if (changes.length === 0) throw new WriteError("No skin changed");
    if (new Set(changes.map((c) => c.plan)).size !== changes.length) throw new WriteError("A plan is named twice");
    if (changes.some((c) => !Number.isInteger(c.plan) || c.plan < 1 || c.plan > SKIN_PLANS || !Number.isInteger(c.theme) || c.theme < 0 || c.theme > 255)) throw new SkinRefusedError("invalid-skin");
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      for (const c of changes) if (c.theme !== 0 && !(((p.owned[c.theme] ?? 0) >>> c.plan) & 1)) throw new SkinRefusedError("not-owned", hash);
      for (const c of changes) p.active[c.plan - 1] = c.theme;
      return [this.event("SkinsActivated", { playerId: account, active: activeWord(p.active) })];
    });
  }

  /**
   * `Avatar.buy_avatar_item(part, id, max_cobbles)`, after the writer's checks: the item on sale at the confirmed price (the
   * block time is the device's), then owned, then the balance. Its Cobbles leave the balance as `Setup.spend_cobbles` takes them.
   */
  async buyAvatarItem(account: string, { part, id, confirmedPrice }: BuyAvatarItemRequest): Promise<WriteResult> {
    const item = await this.avatarItem(part, id);
    const listed = item.state === 1;
    if (!listed || item.cobbles === 0) throw new AvatarRefusedError("not-for-sale");
    if (item.cobbles !== confirmedPrice) throw new AvatarPriceChangedError(confirmedPrice, item.cobbles);
    if (item.until !== 0 && Date.now() / 1000 >= item.until) throw new AvatarRefusedError("sale-ended");
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      const owned = BigInt(p.avatarOwned?.[part] ?? "0");
      if (owned & bit(id)) throw new AvatarRefusedError("owned", hash);
      if (p.cobbles < item.cobbles) throw new AvatarRefusedError("not-enough-cobbles", hash);
      p.cobbles -= item.cobbles;
      p.avatarOwned = { ...p.avatarOwned, [part]: (owned | bit(id)).toString() };
      return [this.event("AvatarItemBought", { playerId: account, part, id, cobbles: item.cobbles, sold: item.sold + 1, balance: p.cobbles })];
    });
  }

  /** `Avatar.set_avatar(look)`: 0 clears it; any other must be of the format with every part listed and free, or owned. */
  async setAvatar(account: string, look: bigint): Promise<WriteResult> {
    if (look < 0n || look >= 2n ** 128n) throw new AvatarRefusedError("invalid-look");
    await sleep(this.latency);
    return this.write(account, (p, hash) => [this.lookSet(account, p, look, hash)]);
  }

  /** `set_avatar`'s checks, then the look stored: its event. */
  private lookSet(account: string, p: StoredPlayer, look: bigint, hash: string): DecodedEvent {
    if (look !== 0n) {
      if ((look & 0xffn) !== 1n || look >> BigInt(8 * (AVATAR_PARTS_IN_USE + 1)) !== 0n) throw new AvatarRefusedError("invalid-look", hash);
      for (let part = 0; part < AVATAR_PARTS_IN_USE; part++) {
        const id = Number((look >> BigInt(8 * (part + 1))) & 0xffn);
        const item = AVATAR_ITEMS[part]?.[id];
        const free = item !== undefined && item.state === 1 && item.cobbles === 0;
        if (!free && !(BigInt(p.avatarOwned?.[part] ?? "0") & bit(id))) throw new AvatarRefusedError("not-owned", hash);
      }
    }
    p.avatar = look.toString();
    return this.event("AvatarSet", { playerId: account, look });
  }

  /** The player's name (#926): letters and digits, 3 to 15 characters (a short string, if it goes on chain). */
  async setName(account: string, name: string): Promise<WriteResult> {
    await sleep(this.latency);
    return this.write(account, (p) => [this.nameSet(account, p, name)]);
  }

  private nameSet(account: string, p: StoredPlayer, name: string): DecodedEvent {
    if (!MOCK_NAME.test(name)) throw new WriteError(`Not a name: ${JSON.stringify(name)} (letters and digits, 3 to ${PLAYER_NAME_MAX})`);
    p.name = name;
    return this.event("NameSet", { playerId: account, name });
  }

  /**
   * `Avatar.rename(name, max_cobbles)` (PLAYER-RENAME) with the contract's checks and the writer's refusals: letters and digits, 3
   * to 15; not the current name; held by no other player in any case; the first change free, a later one at the rename price,
   * never another than the one confirmed; the Cobbles debited. The drawn name (#926) is not a change. Its receipt: `Renamed`,
   * and `CobblesSpent` for a paid change.
   */
  async rename(account: string, { name, confirmedPrice }: RenameRequest): Promise<WriteResult> {
    if (!isPlayerName(name)) throw new RenameRefusedError("invalid-name");
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      const count = p.renames ?? 0;
      const cost = count === 0 ? 0 : AVATAR_RENAME_PRICE;
      if (cost !== confirmedPrice) throw new RenameRefusedError("price-changed", hash);
      if (p.name === name) throw new RenameRefusedError("same-name", hash);
      const holder = this.holderOf(nameKey(name)!);
      if (holder !== null && addressKey(holder) !== addressKey(account)) throw new RenameRefusedError("taken", hash);
      if (p.cobbles < cost) throw new RenameRefusedError("not-enough-cobbles", hash);
      p.cobbles -= cost;
      p.name = name;
      p.renames = count + 1;
      const renamed = this.event("Renamed", { playerId: account, name, cobbles: cost, count: count + 1 });
      return cost === 0 ? [renamed] : [renamed, this.event("CobblesSpent", { playerId: account, spender: this.options.seller, reason: "RENAME", cobbles: cost, balance: p.cobbles })];
    });
  }

  /**
   * A new player's name and look at their first connection (#926): `draw` gives them, the look over the catalogue's offers
   * (`avatarOffers`), and both are stored as `setName` and `setAvatar` store them, with their checks, in one step under the
   * lock. Only for an account with no name; a look saved already stays. No latency, as `foundAtConnection`. Resolves true
   * when it named the player.
   */
  async nameAtConnection(account: string, draw: (catalogue: NewPlayerCatalogue) => { name: string; look: bigint }): Promise<boolean> {
    return this.lock(() => {
      this.sync();
      const p = this.peek(account);
      if (p.name !== undefined) return false;
      const owned = AVATAR_ITEMS.map((_, part) => BigInt(p.avatarOwned?.[part] ?? "0"));
      const { name, look } = draw({ parts: AVATAR_PARTS_IN_USE, items: AVATAR_ITEMS, owned });
      this.commit(account, (q, hash) => [this.nameSet(account, q, name), ...(BigInt(q.avatar ?? "0") === 0n ? [this.lookSet(account, q, look, hash)] : [])]);
      return true;
    });
  }
}
