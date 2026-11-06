import type { ReactNode } from "react";
import { Icon } from "../ui/icon";
import { SectionTitle } from "../elements/section-title";

/** Where the notices file is served: `public/THIRD_PARTY_NOTICES.txt`, copied to `dist` by `vite build`. */
export const NOTICES_PATH = "THIRD_PARTY_NOTICES.txt";

export interface CreditsSceneProps {
  /** The music tracks' titles, in album order. */
  tracks: readonly string[];
  /** The sound effects' credits (#541): the section shows when there are some. */
  sounds?: readonly string[];
  /** Where the site is served, for the notices link. */
  base?: string;
}

/** A section: the drawer's title, its text on a carved surface (information, the owner's rule of 2026-11-04). */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `credits-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <SectionTitle id={id}>{title}</SectionTitle>
      <div className="drawer-carved flex flex-col gap-1 rounded-xl px-4 py-3 text-sm">{children}</div>
    </section>
  );
}

/**
 * Credits (`/settings/credits`, SETTINGS-PAGE: the Paved UX Book's More › Credits, a view of the Settings drawer): the third-party
 * notices the client owes, with a link to their full texts (D-15, moved here from the footer by #536; Cartridge's notice left with
 * its controller, #918); the fonts, icons, music and sounds are named with their licences, and the token icons with their sources
 * (#620). The drawer draws its header (Back to Settings, the red cross); this is its body, in the drawer's sections.
 */
export function CreditsScene({ tracks, sounds = [], base = import.meta.env.BASE_URL }: CreditsSceneProps) {
  return (
    <div data-slot="credits" className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Who made what Paved uses.</p>
      <section aria-labelledby="credits-licences" className="flex flex-col gap-2">
        <SectionTitle id="credits-licences">Licences</SectionTitle>
        {/* A press, raised (the drawer's rule): the notices' full texts, in a tab of their own. */}
        <a
          href={`${base}${NOTICES_PATH}`}
          target="_blank"
          rel="noreferrer"
          className="drawer-raised state-layer text-outline flex min-h-12 items-center gap-3 rounded-xl px-4 py-1.5 font-semibold outline-none"
        >
          <span className="min-w-0 flex-1 wrap-anywhere">Third-party notices</span>
          <Icon name="chevron-right" className="drawer-icon" />
        </a>
        <p className="px-1 text-sm wrap-anywhere text-muted-foreground">The full texts of the licences named on this page.</p>
      </section>
      <Section title="Fonts">
        <p>Almendra, Rubik and Space Mono, under the SIL Open Font License 1.1 (full text in the third-party notices).</p>
      </Section>
      <Section title="Icons">
        <p>Font Awesome Pro, under the Font Awesome Commercial License.</p>
      </Section>
      <Section title="Token icons">
        <ul className="flex flex-col gap-1">
          <li className="wrap-anywhere">
            USDC: the USDC mark, a trademark of Circle Internet Financial, its shape and colours unaltered, to name USDC as Circle's brand
            guidelines ask, on the face of a coin made for Paved; its paths come from cartridge-gg/nums (commit 4f8f405c), MIT, © 2023 Dojo.
          </li>
          <li className="wrap-anywhere">Cobbles (a paving stone), PAVED (a gold coin) and vPAVED (a silver one): made for Paved.</li>
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
    </div>
  );
}
