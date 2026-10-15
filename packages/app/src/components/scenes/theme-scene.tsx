import type { Tab } from "../../routes/pages";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Cobbles } from "../elements/cobbles";
import { Notice } from "../elements/notice";
import { PLANS, applySkinChanges } from "../containers/cobble-types";
import { SkinGrid, THEME_CODES } from "../containers/skin-grid";
import { TabPage } from "../containers/tab-page";
import { THEMES, ThemeCard, type ThemeId } from "../containers/theme-card";

/**
 * The tile skins of one theme (gems-v1.md 5): what the player owns and has active, the batch of switches not saved yet,
 * and what is on its way. Provisional until CORE's skins PR (gems PR 3).
 */
export interface ThemeSkins {
  /** The theme browsed: any but Default (Default is the base art, theme 0). */
  theme: Exclude<ThemeId, "default">;
  /** `AccountView.gems`. */
  balance: number;
  /** `skin_price(theme, p)` at index p - 1; all 0: the theme sells nothing yet. */
  prices: readonly number[];
  /** `skins(player_id, theme)`. */
  owned: number;
  /** `active_skins(player_id)`, as saved: one theme id per plan. */
  active: readonly number[];
  /** The switches changed since: plan to theme id, saved in one `set_skins` write. */
  changes: Readonly<Record<number, number>>;
  /** The plan whose `buy_skin` is on its way. */
  buying?: number | null;
  /** `set_skins`: on its way, or just done. */
  save?: "idle" | "saving" | "saved";
}

export interface ThemeSceneProps {
  /** The theme in use, kept on this device. */
  selected: ThemeId;
  /** The tiles the preview cards draw. */
  tiles: readonly { plan: number; orientation: number }[];
  /** Where the tile art is served. */
  tileArt?: string;
  /** The skins of the theme browsed (P-61); omitted: the board's look only. */
  skins?: ThemeSkins | null;
  onSelect?: (id: ThemeId) => void;
  onBrowse?: (id: Exclude<ThemeId, "default">) => void;
  onBuySkin?: (plan: number) => void;
  onToggleSkin?: (plan: number) => void;
  onSaveSkins?: () => void;
  onDiscardSkins?: () => void;
  /** To the Cobble packs. */
  onBuyCobbles?: () => void;
  onBack?: () => void;
  onNavigate?: (tab: Tab) => void;
}

const SKINNED = THEMES.filter((t) => t.id !== "default");

/**
 * The theme (`/settings/theme`, from Settings): Default (meadows) and Forest to choose, Snow, Desert and Volcano coming
 * soon; each a preview card. The previews of the themes beyond Default tint the base art until theirs exists. Below, the
 * tile skins (P-61): a theme's 19 plans, each bought with Cobbles and switched on one by one, at most one theme per plan;
 * the switches are saved together, in one write.
 */
export function ThemeScene({ selected, tiles, tileArt, skins, onSelect, onBack, onNavigate, ...props }: ThemeSceneProps) {
  return (
    <TabPage tab="settings" title="Theme" subtitle="How the board looks" onBack={onBack} onNavigate={onNavigate} end={skins ? <Cobbles value={skins.balance} /> : undefined}>
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-3">
        {THEMES.map((t) => (
          <ThemeCard key={t.id} theme={t} selected={t.id === selected} tiles={tiles} artBase={tileArt} onSelect={onSelect} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        A theme changes the board's look only: the tiles, their rules and the scores stay the same. Previews beyond Default are tinted sketches until their art
        is in.
      </p>
      {skins && <SkinsSection skins={skins} tileArt={tileArt} {...props} />}
    </TabPage>
  );
}

type SkinsSectionProps = Pick<ThemeSceneProps, "tileArt" | "onBrowse" | "onBuySkin" | "onToggleSkin" | "onSaveSkins" | "onDiscardSkins" | "onBuyCobbles"> & { skins: ThemeSkins };

function SkinsSection({ skins, tileArt, onBrowse, onBuySkin, onToggleSkin, onSaveSkins, onDiscardSkins, onBuyCobbles }: SkinsSectionProps) {
  const theme = THEMES.find((t) => t.id === skins.theme)!;
  const code = THEME_CODES[skins.theme];
  const active = applySkinChanges(skins.active, skins.changes);
  const count = active.filter((t) => t === code).length;
  const changes = Object.keys(skins.changes).length;
  const onSale = skins.prices.some((p) => p > 0);
  const saving = skins.save === "saving";
  const cheapest = Math.min(...skins.prices.filter((p) => p > 0));
  return (
    <section aria-labelledby="skins-title" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="skins-title" className="font-display text-base font-semibold">
          Tile skins
        </h2>
        <p className="text-xs text-muted-foreground">Buy a tile's skin with Cobbles, then switch it on. One skin per tile: switching one on replaces another theme's.</p>
      </div>
      <Tabs value={skins.theme} onValueChange={(v) => onBrowse?.(v as ThemeSkins["theme"])}>
        <TabsList className="w-full">
          {SKINNED.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="flex-1 px-1 text-xs">
              {t.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {!theme.available || !onSale ? (
        <div data-slot="card" className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-10 text-center">
          <Icon name="lock" size="xl" className="text-muted-foreground" />
          <p className="text-sm font-semibold">{theme.name} skins: coming soon</p>
          <p className="text-xs text-muted-foreground">Its tiles go on sale when its art is in.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              <span className="numeric font-semibold text-primary">{count}</span>
              <span className="text-muted-foreground"> of </span>
              <span className="numeric font-semibold">{PLANS}</span>
              <span className="text-muted-foreground"> active</span>
            </span>
            {count === PLANS && (
              <span className="flex items-center gap-1 text-xs text-primary">
                <Icon name="circle-check" size="xs" />
                The whole set
              </span>
            )}
          </div>
          {skins.balance < cheapest && skins.owned === 0 && (
            <Notice
              title={skins.balance === 0 ? "No Cobbles yet" : "Not enough Cobbles"}
              action={
                <Button size="sm" variant="outline" onClick={onBuyCobbles}>
                  Get Cobbles
                </Button>
              }
            >
              A skin costs <span className="numeric">{cheapest}</span> to <span className="numeric">{Math.max(...skins.prices)}</span> Cobbles. Earn them from quests and achievements, or buy a pack.
            </Notice>
          )}
          <SkinGrid
            theme={skins.theme}
            prices={skins.prices}
            owned={skins.owned}
            active={active}
            balance={skins.balance}
            buying={skins.buying}
            busy={saving}
            tileArt={tileArt}
            onBuy={onBuySkin}
            onToggle={onToggleSkin}
          />
          <SaveBar changes={changes} save={skins.save ?? "idle"} busy={skins.buying != null} onSave={onSaveSkins} onDiscard={onDiscardSkins} />
        </>
      )}
    </section>
  );
}

/** The batch of switches: how many changed, Save (one `set_skins` write) and Discard; then saving, then saved. */
function SaveBar({ changes, save, busy, onSave, onDiscard }: { changes: number; save: "idle" | "saving" | "saved"; busy: boolean; onSave?: () => void; onDiscard?: () => void }) {
  if (changes === 0 && save !== "saved") return null;
  if (changes === 0) {
    return (
      <p role="status" className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <Icon name="circle-check" size="sm" className="text-success" />
        Skins saved
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
        <Button size="sm" onClick={onSave} loading={save === "saving"} disabled={busy}>
          {save === "saving" ? "Saving…" : "Save"}
        </Button>
      </span>
    </div>
  );
}
