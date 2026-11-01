import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TRAIT_PARTS, type Trait } from "@paved/renderer";
import { errorDetail } from "../error-detail";
import { idsOfLook, lookOf, optionName, randomUsable, sameAvatar, withPart, type TraitIds } from "../../components/containers/avatar-types";
import { AvatarCreatorScene, type AvatarCreator } from "../../components/scenes/avatar-creator-scene";
import { avatarKeys } from "../../data/avatar";
import { useAvatarCatalogue, useAvatarWrites } from "../../data/avatar-catalogue";
import { avatarOffers } from "../../data/avatar-offers";
import { cobbleKeys } from "../../data/cobbles";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { useCobblesSheet } from "../cobbles-sheet";
import { useAppNavigate, useBack } from "../ref";
import { skinsStatus } from "../skins-status";

/**
 * `/avatar` (#626 PR 2): the avatar creator, from Edit avatar in the profile sheet. The catalogue, the player's items, their
 * saved look and their Cobbles from the chain (`useAvatarCatalogue`); the draft is the page's, from the saved look. Buy sends
 * one `buy_avatar_item` at the price the swatch showed; Save one `set_avatar` of the draft as the traits' look
 * (`encodeTraits`). The receipts' events go into the cache (`useAvatarWrites`), and the menus' avatar reads the same look.
 */
export default function Page() {
  const go = useAppNavigate();
  const cobbles = useCobblesSheet();
  const onBack = useBack();
  const wallet = useAccount();
  const sources = useDataSources();
  const playerId = sources.signer?.address ?? null;
  const read = useAvatarCatalogue(playerId);
  const writes = useAvatarWrites(playerId);
  const client = useQueryClient();
  // A seasonal sale's end is read against the time the page opened: the chain refuses a sale past its end anyway.
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  // The draft: null is the saved avatar, so a save made on another device shows here until the player changes a part.
  const [changes, setChanges] = useState<TraitIds | null>(null);

  const catalogue = read.data;
  const saved = catalogue ? idsOfLook(catalogue.look) : null;
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
          // Look 0: nothing saved yet, so the king can be saved as he is.
          unsaved: catalogue.look === 0n,
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

  // A write on its way (a purchase or a save): the draft stays as it is until its receipt. `reset` would only detach the page
  // from the write (TanStack's `mutation.reset` cancels nothing), and the save's completion would then clear a newer draft.
  const busy = writes.saving || writes.buying !== null;

  const edit = (next: TraitIds) => {
    if (busy) return;
    writes.reset();
    setChanges(next);
  };

  const buy = (part: Trait, id: number) => {
    const offer = creator?.offers[part]?.[id];
    // The price the swatch shows: the writer reads the item again at send and refuses another.
    if (!offer || offer.kind !== "sale" || busy) return;
    writes.reset();
    writes.buy(partIndex(part), id, offer.cobbles).then(
      () => toast.success(`${optionName(part, id)} bought`, { description: "It is yours: save your avatar to wear it." }),
      () => undefined,
    );
  };

  const save = () => {
    if (!draft || busy) return;
    const sent = draft;
    writes.reset();
    writes.save(lookOf(sent)).then(
      () => {
        // The draft saved is the chain's now; a draft that differs from it (none while the save is on its way) stays.
        setChanges((current) => (current === null || sameAvatar(current, sent) ? null : current));
        toast.success("Avatar saved", { description: "It shows at the top left of your menus, on every device." });
      },
      () => undefined,
    );
  };

  return (
    <>
      <AvatarCreatorScene
        creator={creator}
        status={skinsStatus(playerId, read)}
        onPick={(part, id) => draft && edit(withPart(draft, part, id))}
        onBuy={buy}
        onSave={save}
        onRandomise={() => creator && edit(randomUsable(creator.offers))}
        onReset={() => {
          if (busy) return;
          writes.reset();
          setChanges(null);
        }}
        onDismissRefusal={writes.reset}
        onBuyCobbles={cobbles.open}
        // Connect here, as the profile sheet does: `/welcome` sends a returning visitor Home, without the wallet.
        onConnect={() => void wallet.connect()}
        onRetry={() => {
          void client.invalidateQueries({ queryKey: avatarKeys.all });
          void client.invalidateQueries({ queryKey: cobbleKeys.all });
        }}
        onBack={onBack}
      />
      {cobbles.sheet}
    </>
  );
}

/** A trait's index in the look (the chain's part number), and back. */
const partIndex = (part: Trait): number => TRAIT_PARTS.indexOf(part);
const partKey = (index: number): Trait => TRAIT_PARTS[index]!;
