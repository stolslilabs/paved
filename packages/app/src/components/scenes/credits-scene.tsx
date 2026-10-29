import type { ReactNode } from "react";
import type { Tab } from "../../routes/pages";
import { TabPage } from "../containers/tab-page";

/** Where the notices file is served: `public/THIRD_PARTY_NOTICES.txt`, copied to `dist` by `vite build`. */
export const NOTICES_PATH = "THIRD_PARTY_NOTICES.txt";

export interface CreditsSceneProps {
  /** The music tracks' titles, in album order. */
  tracks: readonly string[];
  /** The sound effects' credits (#541): the section shows when there are some. */
  sounds?: readonly string[];
  /** Where the site is served, for the notices link. */
  base?: string;
  onBack?: () => void;
  onNavigate?: (tab: Tab) => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `credits-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} data-slot="card" className="flex flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3 text-sm">
      <h2 id={id} className="text-xs font-semibold tracking-wide wrap-anywhere text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Credits (`/settings/credits`): the third-party notices the client owes, one column on every viewport. Cartridge's licence
 * asks for its notice and a link to the full text (D-15, moved here from the footer by #536); the fonts, icons, music and
 * sounds are named with their licences, and the token icons with their sources (#620).
 */
export function CreditsScene({ tracks, sounds = [], base = import.meta.env.BASE_URL, onBack, onNavigate }: CreditsSceneProps) {
  return (
    <TabPage tab="settings" title="Credits" onBack={onBack} onNavigate={onNavigate}>
      <p className="text-sm text-muted-foreground">Who made what Paved uses.</p>
      <Section title="Cartridge Controller">
        <p className="wrap-anywhere">Uses Cartridge Controller, © Cartridge Gaming Company.</p>
        <p>
          <a href={`${base}${NOTICES_PATH}`} target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-2">
            Third-party notices
          </a>
        </p>
      </Section>
      <Section title="Fonts">
        <p>Almendra, Rubik and Space Mono, under the SIL Open Font License 1.1 (full text in the third-party notices).</p>
      </Section>
      <Section title="Icons">
        <p>Font Awesome Pro, under the Font Awesome Commercial License.</p>
      </Section>
      <Section title="Token icons">
        <ul className="flex flex-col gap-1">
          <li className="wrap-anywhere">
            USDC: the USDC mark, a trademark of Circle Internet Financial, shown unaltered to name USDC as Circle's brand guidelines ask; the
            mark comes from cartridge-gg/nums (commit 4f8f405c), MIT, © 2023 Dojo. The coin around it: Font Awesome Pro's coin-front, the
            steel and the relief drawn for Paved.
          </li>
          <li className="wrap-anywhere">Cobbles: one stone cube, drawn for Paved.</li>
          <li className="wrap-anywhere">
            PAVED (gold) and vPAVED (silver): Font Awesome Pro's coin-front under the Font Awesome Commercial License, its P the letter of
            Almendra Bold (SIL Open Font License 1.1) as outlines, the relief drawn for Paved.
          </li>
        </ul>
      </Section>
      <Section title="Music">
        <ul className="flex flex-col gap-0.5 text-muted-foreground">
          {tracks.map((t) => (
            <li key={t} className="wrap-anywhere">
              {t}
            </li>
          ))}
        </ul>
      </Section>
      {sounds.length > 0 && (
        <Section title="Sound effects">
          <ul className="flex flex-col gap-0.5 text-muted-foreground">
            {sounds.map((s) => (
              <li key={s} className="wrap-anywhere">
                {s}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </TabPage>
  );
}
