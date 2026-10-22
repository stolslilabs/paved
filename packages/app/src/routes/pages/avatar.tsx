import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AVATAR_PARTS, AVATAR_PART_KEYS, decodeAvatar, encodeAvatar, type Avatar, type AvatarPart } from "@paved/renderer";
import { errorDetail } from "../error-detail";
import { randomUsable, sameAvatar, withPart } from "../../components/containers/avatar-types";
import { AvatarCreatorScene, type AvatarCreator } from "../../components/scenes/avatar-creator-scene";
import { avatarKeys, avatarOffers, useAvatarCatalogue, useAvatarWrites } from "../../data/avatar";
import { cobbleKeys } from "../../data/cobbles";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { useAppNavigate, useBack } from "../ref";
import { skinsStatus } from "../skins-status";

/**
 * `/avatar` (#626 PR 2): the avatar creator, from Edit avatar in the profile sheet. The catalogue, the player's items, their
 * saved look and their Cobbles from the chain (`useAvatarCatalogue`); the draft is the page's, from the saved look. Buy sends
 * one `buy_avatar_item` at the price the swatch showed; Save one `set_avatar` of the draft in AVATAR-LOOK's format
 * (`encodeAvatar`). The receipts' events go into the cache (`useAvatarWrites`), and the menus' avatar reads the same look.
 */
export default function Page() {
  const go = useAppNavigate();
  const onBack = useBack();
  useAccount();
  const sources = useDataSources();
  const playerId = sources.signer?.address ?? null;
  const read = useAvatarCatalogue(playerId);
  const writes = useAvatarWrites(playerId);
  const client = useQueryClient();
  // A seasonal sale's end is read against the time the page opened: the chain refuses a sale past its end anyway.
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  // The draft: null is the saved avatar, so a save made on another device shows here until the player changes a part.
  const [changes, setChanges] = useState<Avatar | null>(null);

  const catalogue = read.data;
  const saved = catalogue ? decodeAvatar(catalogue.look) : null;
  const draft = changes ?? saved;
  // The saved look read again (a save's receipt, another device): a draft equal to it is no change any more.
  useEffect(() => {
    if (saved && changes && sameAvatar(saved, changes)) setChanges(null);
  }, [saved, changes]);

  const creator: AvatarCreator | null | undefined =
    catalogue
      ? {
          // Both read from the catalogue: neither is null once it is in.
          saved: saved!,
          draft: draft!,
          balance: catalogue.balance,
          offers: avatarOffers(catalogue, now),
          now,
          save: writes.saving ? "saving" : writes.saved && changes === null ? "saved" : "idle",
          buying: writes.buying ? { part: partKey(writes.buying.part), id: writes.buying.id } : null,
          refusal: writes.error?.message ?? null,
          refusalDetail: writes.error ? errorDetail(writes.error) : undefined,
        }
      : catalogue;

  const edit = (next: Avatar) => {
    writes.reset();
    setChanges(next);
  };

  const buy = (part: AvatarPart, id: number) => {
    const offer = creator?.offers[part]?.[id];
    // The price the swatch shows: the writer reads the item again at send and refuses another.
    if (!offer || offer.kind !== "sale") return;
    writes.reset();
    writes.buy(partIndex(part), id, offer.cobbles).then(
      () => toast.success(`${AVATAR_PARTS[part][id]} bought`, { description: "It is yours: save your avatar to wear it." }),
      () => undefined,
    );
  };

  const save = () => {
    if (!draft) return;
    writes.reset();
    writes.save(encodeAvatar(draft)).then(
      () => {
        setChanges(null);
        toast.success("Avatar saved", { description: "It shows at the top left of your menus, on every device." });
      },
      () => undefined,
    );
  };

  return (
    <AvatarCreatorScene
      creator={creator}
      status={skinsStatus(playerId, read)}
      onPick={(part, id) => draft && edit(withPart(draft, part, id))}
      onBuy={buy}
      onSave={save}
      onRandomise={() => creator && edit(randomUsable(creator.offers))}
      onReset={() => {
        writes.reset();
        setChanges(null);
      }}
      onDismissRefusal={writes.reset}
      onBuyCobbles={() => go("/cobbles")}
      onConnect={() => go("/welcome")}
      onRetry={() => {
        void client.invalidateQueries({ queryKey: avatarKeys.all });
        void client.invalidateQueries({ queryKey: cobbleKeys.all });
      }}
      onBack={onBack}
    />
  );
}

/** A part's index in the format (the chain's part number), and back. */
const partIndex = (part: AvatarPart): number => AVATAR_PART_KEYS.indexOf(part);
const partKey = (index: number): AvatarPart => AVATAR_PART_KEYS[index]!;
