import type { Tab } from "../../routes/pages";
import { TabPage } from "../containers/tab-page";
import { THEMES, ThemeCard, type ThemeId } from "../containers/theme-card";

export interface ThemeSceneProps {
  /** The theme in use, kept on this device. */
  selected: ThemeId;
  /** The tiles the preview cards draw. */
  tiles: readonly { plan: number; orientation: number }[];
  /** Where the tile art is served. */
  tileArt?: string;
  onSelect?: (id: ThemeId) => void;
  onBack?: () => void;
  onNavigate?: (tab: Tab) => void;
}

/**
 * The theme (`/settings/theme`, from Settings): Default (meadows) and Forest to choose, Snow, Desert and Volcano coming
 * soon; each a preview card. The previews of the themes beyond Default tint the base art until theirs exists.
 */
export function ThemeScene({ selected, tiles, tileArt, onSelect, onBack, onNavigate }: ThemeSceneProps) {
  return (
    <TabPage tab="settings" title="Theme" subtitle="How the board looks" onBack={onBack} onNavigate={onNavigate}>
      <div role="radiogroup" aria-label="Theme" className="grid gap-3 tablet:grid-cols-2 desktop:grid-cols-3">
        {THEMES.map((t) => (
          <ThemeCard key={t.id} theme={t} selected={t.id === selected} tiles={tiles} artBase={tileArt} onSelect={onSelect} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        A theme changes the board's look only: the tiles, their rules and the scores stay the same. Previews beyond Default are tinted sketches until their art
        is in.
      </p>
    </TabPage>
  );
}
