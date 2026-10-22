import { AvatarPriceChangedError, AvatarRefusedError, lookIds, type AvatarViews, type BuyAvatarItemRequest, type DecodedEvent, type FakeGameViews, type WriteResult } from "@paved/chain";

const event = (name: string, fields: Record<string, unknown>): DecodedEvent => ({ name, fields }) as unknown as DecodedEvent;

/** `Avatar`'s writes in memory, on the fake views: `buy_avatar_item` and `set_avatar` with the contract's checks. */
export class FakeAvatarWriter {
  readonly sent: string[] = [];
  constructor(
    readonly views: FakeGameViews,
    readonly address: string,
  ) {}

  async buyAvatarItem({ part, id, confirmedPrice }: BuyAvatarItemRequest, views: Pick<AvatarViews, "avatarItem">): Promise<WriteResult> {
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
}

