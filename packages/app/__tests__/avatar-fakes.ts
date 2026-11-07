import { AvatarPriceChangedError, AvatarRefusedError, RenameRefusedError, isPlayerName, lookIds, type AvatarViews, type BuyAvatarItemRequest, type DecodedEvent, type FakeGameViews, type NameViews, type RenameRequest, type WriteResult } from "@paved/chain";

const event = (name: string, fields: Record<string, unknown>): DecodedEvent => ({ name, fields }) as unknown as DecodedEvent;

/** `Avatar`'s writes in memory, on the fake views: `buy_avatar_item`, `set_avatar` and `rename` (PLAYER-RENAME) with the contract's checks. */
export class FakeAvatarWriter {
  readonly sent: string[] = [];
  /** While set, a write waits for it before answering: the page's pending state. */
  gate: Promise<void> | null = null;
  constructor(
    readonly views: FakeGameViews,
    readonly address: string,
  ) {}

  async buyAvatarItem({ part, id, confirmedPrice }: BuyAvatarItemRequest, views: Pick<AvatarViews, "avatarItem">): Promise<WriteResult> {
    if (this.gate) await this.gate;
    const item = await views.avatarItem(part, id);
    const current = item.state === 1 ? item.cobbles : 0;
    if (current !== confirmedPrice) throw new AvatarPriceChangedError(confirmedPrice, current);
    this.sent.push(`buy ${part} ${id}`);
    const player = this.views.avatarPlayer(this.address);
    const ledger = this.views.cobblePlayer(this.address);
    const owned = player.owned.get(part) ?? 0n;
    if (owned & (1n << BigInt(id))) throw new AvatarRefusedError("owned", "0x1");
    if (ledger.account.cobbles < current) throw new AvatarRefusedError("not-enough-cobbles", "0x1");
    ledger.account = { ...ledger.account, cobbles: ledger.account.cobbles - current };
    player.owned.set(part, owned | (1n << BigInt(id)));
    return { transactionHash: "0x1", events: [event("AvatarItemBought", { playerId: this.address, part, id, cobbles: current, sold: 1, balance: ledger.account.cobbles })] };
  }

  async setAvatar(look: bigint): Promise<WriteResult> {
    if (this.gate) await this.gate;
    this.sent.push(`set ${look}`);
    const player = this.views.avatarPlayer(this.address);
    const ids = lookIds(look, this.views.avatars.parts);
    if (look !== 0n) {
      if (!ids) throw new AvatarRefusedError("invalid-look", "0x2");
      ids.forEach((id, part) => {
        const item = this.views.avatars.items.get(`${part}:${id}`);
        const free = item?.state === 1 && item.cobbles === 0;
        if (!free && !((player.owned.get(part) ?? 0n) & (1n << BigInt(id)))) throw new AvatarRefusedError("not-owned", "0x2");
      });
    }
    player.look = look;
    return { transactionHash: "0x2", events: [event("AvatarSet", { playerId: this.address, look })] };
  }

  /** `Avatar.rename(name, max_cobbles)`: the writer's checks before sending, then the contract's; `Renamed`, and `CobblesSpent` when paid. */
  async rename({ name, confirmedPrice }: RenameRequest, views: Pick<NameViews, "renameCount" | "renamePrice" | "nameOwner" | "playerName">): Promise<WriteResult> {
    if (!isPlayerName(name)) throw new RenameRefusedError("invalid-name");
    if (this.gate) await this.gate;
    const [count, price, owner] = await Promise.all([views.renameCount(this.address), views.renamePrice(), views.nameOwner(name)]);
    const cost = count === 0 ? 0 : price;
    if (cost !== confirmedPrice) throw new RenameRefusedError("price-changed");
    this.sent.push(`rename ${name} ${confirmedPrice}`);
    const held = this.views.namePlayer(this.address);
    if (held.name === name) throw new RenameRefusedError("same-name", "0x3");
    if (owner !== null && BigInt(owner) !== BigInt(this.address)) throw new RenameRefusedError("taken", "0x3");
    const ledger = this.views.cobblePlayer(this.address);
    if (ledger.account.cobbles < cost) throw new RenameRefusedError("not-enough-cobbles", "0x3");
    ledger.account = { ...ledger.account, cobbles: ledger.account.cobbles - cost };
    held.name = name;
    held.count = count + 1;
    const renamed = event("Renamed", { playerId: this.address, name, cobbles: cost, count: held.count });
    const events = cost === 0 ? [renamed] : [renamed, event("CobblesSpent", { playerId: this.address, reason: "RENAME", cobbles: cost, balance: ledger.account.cobbles })];
    return { transactionHash: "0x3", events };
  }
}

