import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TRAIT_PARTS, type Trait } from "@paved/renderer";
import { useBackToProfile } from "../../components/containers/profile-context";
import { errorDetail } from "../error-detail";
import { idsOfLook, lookOf, optionName, randomUsable, sameAvatar, withPart, type TraitIds } from "../../components/containers/avatar-types";
import { AvatarCreatorScene, type AvatarCreator } from "../../components/scenes/avatar-creator-scene";
import { avatarKeys } from "../../data/avatar";
import { useAvatarCatalogue, useAvatarWrites } from "../../data/avatar-catalogue";
import { avatarOffers } from "../../data/avatar-offers";
import { cobbleKeys } from "../../data/cobbles";
import { useDataSources } from "../../data/sources";
import { useCobblesSheet } from "../cobbles-sheet";
import { useDrawerRoute } from "../drawer-route";
import { useBack } from "../ref";
import { skinsStatus } from "../skins-status";

/** The category in the URL (`/avatar?part=headwear`), so Back and a link find it again. */
const PART_PARAM = "part";
const isTrait = (value: string | null): value is Trait => value !== null && (TRAIT_PARTS as readonly string[]).includes(value);

/**
 * `/avatar` (#626 PR 2; AVATAR-PAGE: the HUD's drawer docked at the left, as the Profile that opens it): the avatar editor. The
 * catalogue, the player's items, their saved look and their Cobbles from the chain (`useAvatarCatalogue`); the draft is the page's,
 * from the saved look (no league on the avatar's pages: the owner's ask of 2026-11-06). Buy sends one
 * `buy_avatar_item` at the price the option showed; Save one `set_avatar` of the draft as the traits' look (`encodeTraits`). The
 * receipts' events go into the cache (`useAvatarWrites`), and the menus' avatar reads the same look. Back returns to the Profile
 * (`useBackToProfile`, then the drawer's close), the red cross to the village. The category is the URL's (`?part=`, replaced).
 */
export default function Page() {
  const drawer = useDrawerRoute();
  const back = useBack();
  const onClose = drawer?.onClose ?? back;
  const toProfile = useBackToProfile();
  const cobbles = useCobblesSheet();
  const [params, setParams] = useSearchParams();
  const asked = params.get(PART_PARAM);
  const sources = useDataSources();
  const playerId = sources.signer?.address ?? null;
  const read = useAvatarCatalogue(playerId);
  const writes = useAvatarWrites(playerId);
  const client = useQueryClient();
  // A seasonal sale's end is read against the time the drawer opened (each opening reads it again), then again at the nearest end
  // while it is open (below): an offer past its end leaves without a reload. The chain refuses a sale past its end anyway.
  const [now, setNow] = useState(nowSeconds);
  // The draft: null is the saved avatar, so a save made on another device shows here until the player changes a part.
  const [changes, setChanges] = useState<TraitIds | null>(null);
  // The drawer's page stays mounted once closed (its host keeps it): each opening starts again from the saved look, as a visit did when
  // the editor was a page of its own (a write on its way keeps its draft until its receipt).
  const open = drawer?.open ?? true;
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setNow(nowSeconds());
    if (open && !writes.saving && writes.buying === null) setChanges(null);
  }

  const catalogue = read.data;
  // The catalogue in (late after the opening, or read again): its offers are read at that instant, not at the opening's.
  const [seenCatalogue, setSeenCatalogue] = useState(catalogue);
  if (catalogue !== seenCatalogue) {
    setSeenCatalogue(catalogue);
    if (catalogue) setNow(nowSeconds());
  }
  // While the drawer is open, a timer to the nearest seasonal end still ahead: the offers are read again at that instant.
  const deadline = open && catalogue ? nextEnd(catalogue.items, now) : null;
  useEffect(() => {
    if (deadline === null) return;
    // Measured against the clock, not `now` (the render may come later than it): an end already passed reads again at once.
    const delay = Math.max(0, deadline * 1000 - Date.now());
    // At the end, `now` is at least the end (a timer a few ms early would leave the offer on); a far end, read again on the way.
    const timer = setTimeout(() => setNow(delay > MAX_DELAY ? nowSeconds() : Math.max(deadline, nowSeconds())), Math.min(delay, MAX_DELAY));
    return () => clearTimeout(timer);
  }, [deadline]);
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
        // No Connect (the owner's ask of 2026-11-06: every player has an account on the L3): until its signer is in (the wallet
        // restoring it), the scene shows its loading.
        status={skinsStatus(playerId, read)}
        part={isTrait(asked) ? asked : undefined}
        onPart={(part) =>
          setParams(
            (current) => {
              const next = new URLSearchParams(current);
              next.set(PART_PARAM, part);
              return next;
            },
            { replace: true, preventScrollReset: true },
          )
        }
        open={open}
        returnFocus={drawer?.returnFocus}
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
        onRetry={() => {
          void client.invalidateQueries({ queryKey: avatarKeys.all });
          void client.invalidateQueries({ queryKey: cobbleKeys.all });
        }}
        onBack={() => {
          // Back to the Profile that opened the editor: asked open again, shown once the village is (the drawer's close).
          toProfile?.();
          onClose();
        }}
        onClose={onClose}
      />
      {cobbles.sheet}
    </>
  );
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** `setTimeout`'s longest delay (a 32-bit count of ms, about 24 days): a later end waits in steps. */
const MAX_DELAY = 2 ** 31 - 1;

/** The nearest seasonal end after `now` (seconds) of the catalogue's items, or null. */
function nextEnd(items: readonly (readonly { until: number }[])[], now: number): number | null {
  let next: number | null = null;
  for (const part of items) for (const item of part) if (item.until > now && (next === null || item.until < next)) next = item.until;
  return next;
}

/** A trait's index in the look (the chain's part number), and back. */
const partIndex = (part: Trait): number => TRAIT_PARTS.indexOf(part);
const partKey = (index: number): Trait => TRAIT_PARTS[index]!;
