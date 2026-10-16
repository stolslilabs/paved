import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorDetail } from "../error-detail";
import { PLANS, dropSavedChanges, toggleSkin } from "../../components/containers/cobble-types";
import { THEME_CODES } from "../../components/containers/skin-grid";
import { THEMES } from "../../components/containers/theme-card";
import { ThemeScene, type SkinsStatus, type ThemeSkins } from "../../components/scenes/theme-scene";
import { cobbleKeys } from "../../data/cobbles";
import { skinChanges, skinKeys, useDeviceTheme, useShowSkins, useSkinWrites, useThemeSkins } from "../../data/skins";
import { useDataSources } from "../../data/sources";
import { useTileArt } from "../../data/tile-art";
import { useAccount } from "../../wallet/wallet";
import { useAppNavigate, useBack, useTabNavigate } from "../ref";

/** Where the renderer's assets are served: the tile images of the previews and of the skins' chips. */
const RENDERER_ASSETS = `${import.meta.env.BASE_URL}renderer-assets`;

/** The eighteen tiles a theme's preview card draws (six by three): every plan but one, turned in turn. */
const PREVIEW_TILES = Array.from({ length: 18 }, (_, i) => ({ plan: (i % PLANS) + 1, orientation: i % 4 }));

/**
 * `/settings/theme` (P11b): the board's look chosen on this device (`useDeviceTheme`), and a theme's 19 tile skins on
 * `Setup` (cobbles v1, part 3): each price, owned and active state from the chain (`useThemeSkins`), Buy (one `buy_skin`)
 * and the switches batched, Save sending only the plans that changed (one `set_skins`, about 0.12M gas per plan). The
 * receipts move the cache (`useSkinWrites`): the balance from `SkinBought`, the active set from `SkinsActivated`, then the
 * reads reconcile. Forest (theme 1) is the one theme on sale; Snow, Desert and Volcano are coming soon and not read. The
 * player is the signer's address: without one the skins ask to Connect. A wallet approved earlier is looked for here too
 * (`useAccount`).
 */
export default function Page() {
  const go = useAppNavigate();
  const onNavigate = useTabNavigate();
  const onBack = useBack();
  useAccount();
  const sources = useDataSources();
  const playerId = sources.signer?.address ?? null;
  const [selected, select] = useDeviceTheme();
  const [showSkins, setShowSkins] = useShowSkins();
  const [browsed, browse] = useState<ThemeSkins["theme"]>("forest");
  const [changes, setChanges] = useState<Record<number, number>>({});
  const available = THEMES.find((t) => t.id === browsed)?.available ?? false;
  const code = THEME_CODES[browsed];
  const read = useThemeSkins(playerId, available ? code : null);
  const writes = useSkinWrites(playerId);
  const client = useQueryClient();
  const tileArt = useTileArt(RENDERER_ASSETS);

  // The active set read again (after a save whose receipt could not be read, it may hold the batch): what it already holds is no change.
  const active = read.data?.active;
  useEffect(() => {
    if (active) setChanges((c) => dropSavedChanges(active, c));
  }, [active]);

  const skins: ThemeSkins | null = read.data
    ? {
        theme: browsed,
        ...read.data,
        changes,
        buying: writes.buying,
        save: writes.saving ? "saving" : writes.saved && Object.keys(changes).length === 0 ? "saved" : "idle",
        refusal: writes.error?.message ?? null,
        refusalDetail: writes.error ? errorDetail(writes.error) : undefined,
      }
    : null;
  // A deployment without the skins' views (`read.data` null) shows the board's look only.
  const status: SkinsStatus | null =
    playerId === null
      ? { kind: "guest" }
      : read.error
        ? { kind: "error", message: read.error.message, detail: errorDetail(read.error) }
        : read.data === undefined
          ? { kind: "loading" }
          : null;

  const buy = (plan: number) => {
    // The price the card shows: the writer reads `skin_price` again at send and refuses another.
    const price = read.data?.prices[plan - 1];
    if (!available || !price) return;
    writes.reset();
    writes.buy(code, plan, price).then(
      () => toast.success("Skin bought", { description: "Switch it on, then save." }),
      () => undefined,
    );
  };
  const toggle = (plan: number) => {
    if (!read.data) return;
    writes.reset();
    setChanges((c) => toggleSkin(read.data!.active, c, plan, code));
  };
  const save = () => {
    const batch = skinChanges(changes);
    if (batch.length === 0) return;
    writes.reset();
    // Kept on a refusal, so the player can try again; cleared once the receipt's active set is the cache's.
    writes.save(batch).then(
      () => setChanges({}),
      () => undefined,
    );
  };

  return (
    <ThemeScene
      selected={selected}
      tiles={PREVIEW_TILES}
      tileArt={tileArt}
      skins={skins}
      skinsStatus={status}
      showSkins={showSkins}
      onShowSkins={setShowSkins}
      onSelect={select}
      onBrowse={browse}
      onBuySkin={buy}
      onToggleSkin={toggle}
      onSaveSkins={save}
      onDiscardSkins={() => {
        writes.reset();
        setChanges({});
      }}
      onDismissRefusal={writes.reset}
      onBuyCobbles={() => go("/play/challenge?tab=cobbles")}
      onConnect={() => go("/welcome")}
      onRetry={() => {
        void client.invalidateQueries({ queryKey: skinKeys.all });
        void client.invalidateQueries({ queryKey: cobbleKeys.all });
      }}
      onBack={onBack}
      onNavigate={onNavigate}
    />
  );
}
