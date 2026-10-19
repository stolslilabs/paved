import type { Tab } from "../../routes/pages";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import type { TileRenders } from "../elements/tile-render";
import { PLANS, applySkinChanges, ownsSkin } from "../containers/cobble-types";
import { SkinsStatusView, type SkinsStatus } from "../containers/skins-status";
import { TabPage } from "../containers/tab-page";
import { SKIN_THEMES, THEME_CODES, type SkinThemeId } from "../containers/theme-card";
import { TileSkinPicker, type SkinOption } from "../containers/tile-skin-picker";
import type { OwnedSkins } from "./theme-scene";

/** My tiles' skins: the player's (`useOwnedSkins`), the batch not saved yet, and what is on its way. */
export interface MyTiles extends OwnedSkins {
  /** The picks changed since: plan to theme id, saved in one `set_skins` write. */
  changes: Readonly<Record<number, number>>;
  /** `set_skins`: on its way, or just done. */
  save?: "idle" | "saving" | "saved";
  /** The last write refused or failed: shown until dismissed or the next write. */
  refusal?: string | null;
  refusalDetail?: ErrorDetail;
}

export interface MyTilesSceneProps {
  renders?: TileRenders;
  /** The player's skins; omitted: `skinsStatus` says why. */
  skins?: MyTiles | null;
  skinsStatus?: SkinsStatus | null;
  onPick?: (plan: number, code: number) => void;
  onSave?: () => void;
  onDiscard?: () => void;
  onDismissRefusal?: () => void;
  /** A theme's shop: a tile owned in no theme has Default alone. */
  onOpenShop?: (theme: SkinThemeId) => void;
  onConnect?: () => void;
  onRetry?: () => void;
  onBack?: () => void;
  onNavigate?: (tab: Tab) => void;
}

const DEFAULT: SkinOption = { code: 0, name: "Default" };

/**
 * My tiles (`/settings/tiles`, from Themes and from each theme's shop): the 19 plans, each with the skins the player owns
 * (Default and the themes) as one choice, the active one selected, each its real render. The picks are batched, then
 * saved in one `set_skins` (Save), or dropped (Discard), as the skins were before (P-61): one tile changes, the others stay.
 */
export function MyTilesScene({ renders, skins, skinsStatus, onPick, onSave, onDiscard, onDismissRefusal, onOpenShop, onConnect, onRetry, onBack, onNavigate }: MyTilesSceneProps) {
  const saving = skins?.save === "saving";
  const current = skins ? applySkinChanges(skins.active, skins.changes) : [];
  const ownsAny = skins ? SKIN_THEMES.some((t) => (skins.owned[THEME_CODES[t.id]] ?? 0) !== 0) : false;
  return (
    <TabPage tab="settings" title="My tiles" subtitle="The skin each tile wears on your boards" onBack={onBack} onNavigate={onNavigate}>
      {!skins ? (
        skinsStatus && (
          <SkinsStatusView
            status={skinsStatus}
            guestTitle="Connect to choose your tiles"
            guestText="The skins you own are kept on your account."
            skeleton={
              <ul className="grid grid-cols-1 gap-2 tablet:grid-cols-2 desktop:grid-cols-3">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-40 rounded-xl" />
                ))}
              </ul>
            }
            onConnect={onConnect}
            onRetry={onRetry}
          />
        )
      ) : (
        <>
          {!ownsAny && (
            <Notice
              title="No skins yet"
              action={
                <Button size="sm" variant="outline" onClick={() => onOpenShop?.(SKIN_THEMES[0]!.id as SkinThemeId)}>
                  Open the {SKIN_THEMES[0]!.name} shop
                </Button>
              }
            >
              Every tile wears Default. Buy a theme's tiles with Cobbles, then choose them here.
            </Notice>
          )}
          <InlineError
            title="Not done"
            message={skins.refusal}
            detail={skins.refusalDetail}
            action={
              onDismissRefusal && (
                <Button size="sm" variant="ghost" onClick={onDismissRefusal}>
                  Dismiss
                </Button>
              )
            }
          />
          <ul aria-label="Tiles" className="grid grid-cols-1 gap-2 tablet:grid-cols-2 desktop:grid-cols-3">
            {Array.from({ length: PLANS }, (_, i) => i + 1).map((plan) => {
              const options = [DEFAULT, ...SKIN_THEMES.filter((t) => ownsSkin(skins.owned[THEME_CODES[t.id]] ?? 0, plan)).map((t) => ({ code: THEME_CODES[t.id], name: t.name }))];
              return (
                <TileSkinPicker
                  key={plan}
                  plan={plan}
                  options={options}
                  value={current[plan - 1] ?? 0}
                  saved={skins.active[plan - 1] ?? 0}
                  renders={renders}
                  disabled={saving}
                  onPick={onPick}
                />
              );
            })}
          </ul>
          <SaveBar changes={Object.keys(skins.changes).length} save={skins.save ?? "idle"} onSave={onSave} onDiscard={onDiscard} />
        </>
      )}
    </TabPage>
  );
}

/** The batch of picks: how many changed, Save (one `set_skins` write) and Discard; then saving, then saved. */
function SaveBar({ changes, save, onSave, onDiscard }: { changes: number; save: "idle" | "saving" | "saved"; onSave?: () => void; onDiscard?: () => void }) {
  if (changes === 0 && save !== "saved") return null;
  if (changes === 0) {
    return (
      <p role="status" className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <Icon name="circle-check" size="sm" className="text-success" />
        Tiles saved: your next board wears them
      </p>
    );
  }
  return (
    <div
      aria-label="Unsaved changes"
      role="region"
      className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold-800 bg-card p-3 shadow-lg desktop:bottom-4"
    >
      <span className="text-sm">
        <span className="numeric font-semibold">{changes}</span> {changes === 1 ? "change" : "changes"} to save
      </span>
      <span className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={onDiscard} disabled={save === "saving"}>
          Discard
        </Button>
        <Button size="sm" onClick={onSave} loading={save === "saving"}>
          {save === "saving" ? "Saving…" : "Save"}
        </Button>
      </span>
    </div>
  );
}
