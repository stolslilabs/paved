import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { errorDetail } from "../error-detail";
import { dropSavedChanges, pickSkin } from "../../components/containers/cobble-types";
import { MyTilesScene, type MyTiles } from "../../components/scenes/my-tiles-scene";
import { cobbleKeys } from "../../data/cobbles";
import { RENDERER_ASSETS } from "../../data/renderer-manifest";
import { skinChanges, skinKeys, useOwnedSkins, useSkinWrites } from "../../data/skins";
import { useDataSources } from "../../data/sources";
import { useTileRenders } from "../../data/tile-renders";
import { useAccount } from "../../wallet/wallet";
import { useAppNavigate, useBack, useTabNavigate } from "../ref";
import { skinsStatus } from "../skins-status";

/**
 * `/settings/tiles` (THEMES-RENDERS): My tiles, the skin of each of the 19 plans among those the player owns
 * (`useOwnedSkins`), picked one by one and saved together: Save sends only the plans that changed (one `set_skins`), Discard
 * drops the batch. The receipt's `SkinsActivated` replaces the active set in the cache (`useSkinWrites`), and the board reads
 * the same key.
 */
export default function Page() {
  const go = useAppNavigate();
  const onNavigate = useTabNavigate();
  const onBack = useBack();
  useAccount();
  const sources = useDataSources();
  const playerId = sources.signer?.address ?? null;
  const read = useOwnedSkins(playerId);
  const writes = useSkinWrites(playerId);
  const client = useQueryClient();
  const renders = useTileRenders(RENDERER_ASSETS);
  const [changes, setChanges] = useState<Record<number, number>>({});

  // The active set read again (after a save whose receipt could not be read, it may hold the batch): what it already holds is no change.
  const active = read.data?.active;
  useEffect(() => {
    if (active) setChanges((c) => dropSavedChanges(active, c));
  }, [active]);

  const skins: MyTiles | null | undefined = read.data
    ? {
        ...read.data,
        changes,
        save: writes.saving ? "saving" : writes.saved && Object.keys(changes).length === 0 ? "saved" : "idle",
        refusal: writes.error?.message ?? null,
        refusalDetail: writes.error ? errorDetail(writes.error) : undefined,
      }
    : read.data;

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
    <MyTilesScene
      renders={renders}
      skins={skins}
      skinsStatus={skinsStatus(playerId, read)}
      onPick={(plan, code) => {
        if (!read.data) return;
        writes.reset();
        setChanges((c) => pickSkin(read.data!.active, c, plan, code));
      }}
      onSave={save}
      onDiscard={() => {
        writes.reset();
        setChanges({});
      }}
      onDismissRefusal={writes.reset}
      onOpenShop={(theme) => go(`/settings/theme/${theme}`, { replace: true })}
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
