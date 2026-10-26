import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorDetail } from "../error-detail";
import { THEMES, type ThemeId } from "../../components/containers/theme-card";
import { ThemeScene } from "../../components/scenes/theme-scene";
import { cobbleKeys } from "../../data/cobbles";
import { RENDERER_ASSETS } from "../../data/renderer-manifest";
import { skinChanges, skinKeys, useOwnedSkins, useSkinWrites } from "../../data/skins";
import { useDataSources } from "../../data/sources";
import { useTileRenders } from "../../data/tile-renders";
import { useAccount } from "../../wallet/wallet";
import { useAppNavigate, useBack, useTabNavigate } from "../ref";
import { skinsStatus } from "../skins-status";

/**
 * `/settings/theme` (THEMES-RENDERS): the themes, each card a build-time render of its real tiles (`useTileRenders`) and the
 * tiles owned of 19 (`useOwnedSkins`). Use sends one `set_skins` of every plan that changes, so every tile the player owns in
 * that theme wears it and the others go back to Default (the owner's ruling of 2026-10-18); the scene asks first when that
 * replaces a choice made tile by tile. The receipt moves the cache (`useSkinWrites`), so the board, My tiles and the shop
 * follow. The player is the signer's address: without one the page asks to Connect.
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
  const [applying, setApplying] = useState<ThemeId | null>(null);

  const use = (theme: ThemeId, changes: Record<number, number>) => {
    const batch = skinChanges(changes);
    if (batch.length === 0) return;
    const name = THEMES.find((t) => t.id === theme)?.name ?? theme;
    writes.reset();
    setApplying(theme);
    writes
      .save(batch)
      .then(
        () => toast.success(`${name} in use`, { description: "Your next board wears it." }),
        () => undefined,
      )
      .finally(() => setApplying(null));
  };

  return (
    <ThemeScene
      renders={renders}
      // A deployment without the skins' views (`read.data` null) shows the cards alone.
      skins={read.data}
      skinsStatus={skinsStatus(playerId, read)}
      applying={applying}
      refusal={writes.error?.message ?? null}
      refusalDetail={writes.error ? errorDetail(writes.error) : undefined}
      onDismissRefusal={writes.reset}
      onUse={use}
      onOpen={(theme) => go(`/settings/theme/${theme}`, { replace: true })}
      onMyTiles={() => go("/settings/tiles", { replace: true })}
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
