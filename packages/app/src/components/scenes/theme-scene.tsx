import { useState } from "react";
import type { Tab } from "../../routes/pages";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Icon } from "../ui/icon";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import type { TileRenders } from "../elements/tile-render";
import { PLANS, chooseTheme, ownedCount, themeInUse } from "../containers/cobble-types";
import { SkinsStatusView, type SkinsStatus } from "../containers/skins-status";
import { TabPage } from "../containers/tab-page";
import { THEMES, THEME_CODES, ThemeCard, type SkinThemeId, type ThemeId } from "../containers/theme-card";

export type { SkinsStatus } from "../containers/skins-status";

/**
 * What the chain says of the player's skins across the themes on sale (`useOwnedSkins`): the Cobble balance, the active set
 * (`active_skins`, one theme id per plan, plan 1 first) and each theme's owned word (`skins(player_id, theme)`) by its id.
 */
export interface OwnedSkins {
  balance: number;
  active: readonly number[];
  owned: Readonly<Record<number, number>>;
}

export interface ThemeSceneProps {
  /** The build-time renders (`useTileRenders`): the cards' covers. */
  renders?: TileRenders;
  /** The player's skins; omitted: `skinsStatus` says why. */
  skins?: OwnedSkins | null;
  skinsStatus?: SkinsStatus | null;
  /** The theme whose `set_skins` is on its way. */
  applying?: ThemeId | null;
  /** The last write refused or failed: shown until dismissed or the next write. */
  refusal?: string | null;
  refusalDetail?: ErrorDetail;
  onDismissRefusal?: () => void;
  /** Use a theme: one `set_skins` of the plans that change (`chooseTheme`), asked first when it replaces a tile-by-tile choice. */
  onUse?: (theme: ThemeId, changes: Record<number, number>) => void;
  /** A theme's shop. */
  onOpen?: (theme: SkinThemeId) => void;
  /** My tiles: the skin of each tile. */
  onMyTiles?: () => void;
  onConnect?: () => void;
  onRetry?: () => void;
  onBack?: () => void;
  onNavigate?: (tab: Tab) => void;
}

/**
 * Themes (`/settings/theme`, from Settings): a card per theme with real tiles (Default, Forest), Snow, Desert and Volcano
 * coming soon under a blur. Use puts every owned tile of a theme on the player's boards at once, the others on Default (the
 * owner's ruling of 2026-10-18), and asks first when that replaces a choice made tile by tile; a theme's Tiles is its shop;
 * My tiles chooses tile by tile.
 */
export function ThemeScene({ renders, skins, skinsStatus, applying, refusal, refusalDetail, onDismissRefusal, onUse, onOpen, onMyTiles, onConnect, onRetry, onBack, onNavigate }: ThemeSceneProps) {
  const [confirm, setConfirm] = useState<{ theme: ThemeId; changes: Record<number, number> } | null>(null);
  const busy = applying != null;
  const use = (theme: ThemeId) => {
    if (!skins) return;
    const { changes, overridesChoice } = chooseTheme(skins.active, skins.owned, THEME_CODES[theme]);
    if (Object.keys(changes).length === 0) return;
    if (overridesChoice) setConfirm({ theme, changes });
    else onUse?.(theme, changes);
  };
  const custom = skins ? !THEMES.some((t) => t.available && themeInUse(skins.active, skins.owned, THEME_CODES[t.id])) : false;
  const activeSkins = skins ? skins.active.filter((t) => t !== 0).length : 0;
  const confirmName = confirm ? THEMES.find((t) => t.id === confirm.theme)!.name : "";
  return (
    <TabPage tab="settings" title="Themes" subtitle="How your tiles look on the board" onBack={onBack} onNavigate={onNavigate}>
      {!skins && skinsStatus && skinsStatus.kind !== "loading" && (
        <SkinsStatusView status={skinsStatus} guestTitle="Connect to use themes" guestText="Themes are tiles bought with the Cobbles of your account, and kept on it." onConnect={onConnect} onRetry={onRetry} />
      )}
      <InlineError
        title="Not done"
        message={refusal}
        detail={refusalDetail}
        action={
          onDismissRefusal && (
            <Button size="sm" variant="ghost" onClick={onDismissRefusal}>
              Dismiss
            </Button>
          )
        }
      />
      {skins && (
        <button
          type="button"
          onClick={onMyTiles}
          className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors outline-none state-layer focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon name="table-cells-large" size="md" className="text-primary" fixedWidth />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold">My tiles</span>
            <span className="text-xs text-muted-foreground">
              {custom ? "Your own mix: " : ""}
              <span className="numeric">{activeSkins}</span> of <span className="numeric">{PLANS}</span> tiles wear a skin. Choose tile by tile.
            </span>
          </span>
          <Icon name="chevron-right" size="sm" className="text-muted-foreground" />
        </button>
      )}
      <section aria-label="Themes" aria-busy={skinsStatus?.kind === "loading" || undefined} className="grid grid-cols-1 gap-3 tablet:grid-cols-2">
        {THEMES.map((t) => {
          const code = THEME_CODES[t.id];
          const owned = !skins ? null : code === 0 ? PLANS : ownedCount(skins.owned[code] ?? 0);
          return (
            <ThemeCard
              key={t.id}
              theme={t}
              renders={renders}
              owned={owned}
              inUse={skins ? themeInUse(skins.active, skins.owned, code) : false}
              applying={applying === t.id}
              disabled={busy || !skins}
              onUse={() => use(t.id)}
              onOpen={t.id === "default" ? undefined : () => onOpen?.(t.id as SkinThemeId)}
            />
          );
        })}
      </section>
      <p className="text-xs text-muted-foreground">
        A theme changes how your tiles look, on your boards and for the players who watch them: the tiles, their rules and the scores stay the same.
      </p>
      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent showClose={false}>
          <DialogHeader>
            <DialogTitle>Use {confirmName} on every tile?</DialogTitle>
            <DialogDescription>
              Your tiles wear a mix of skins you chose tile by tile.{" "}
              {confirm?.theme === "default" ? "Every tile goes back to Default." : `Every ${confirmName} tile you own wears it, and the others go back to Default.`} This changes{" "}
              <span className="numeric">{confirm ? Object.keys(confirm.changes).length : 0}</span> tiles.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Keep my mix</Button>
            </DialogClose>
            <Button
              onClick={() => {
                if (confirm) onUse?.(confirm.theme, confirm.changes);
                setConfirm(null);
              }}
            >
              Use {confirmName}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TabPage>
  );
}
