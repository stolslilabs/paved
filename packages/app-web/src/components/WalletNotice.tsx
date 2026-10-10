import type { ReactNode } from "react";

/** Where the notices file is served: `public/THIRD_PARTY_NOTICES.txt`, copied to `dist` by `vite build`. */
export const NOTICES_PATH = "THIRD_PARTY_NOTICES.txt";

/**
 * The notice Cartridge's licence asks of every copy of the client (D-15, made prominent by D-16): that Cartridge
 * Controller is used and is Cartridge's copyright, with a link to the full notices and licence text. Shown on every page
 * and network: the controller's code ships in every build, devnet's included.
 *
 * Body size (1rem, the body font: index.html sets none), always visible (no hover), in normal flow below the app area
 * (`AppShell`) so no page content sits under it, on an opaque bar so the contrast does not depend on the page. The app has one theme (dark, `defaultTheme="dark"`): text #e2e8f0 and
 * link #ffffff on #0a0a0a, 16.06:1 and 19.80:1 (WCAG AA asks 4.5:1). The link is a plain anchor: focusable with Tab, and
 * its focus ring is the browser's.
 */
export const NOTICE_BACKGROUND = "#0a0a0a";
export const NOTICE_TEXT = "#e2e8f0";
export const NOTICE_LINK = "#ffffff";

/**
 * Layout under #root: the app area takes the height left (`flex: 1; min-height: 0`), the notice sits below it in normal
 * flow, so the notice reserves its own height (wrapped or not) and covers no page. The one mount of the notice.
 */
export function AppShell({ children, base }: { children: ReactNode; base?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>{children}</div>
      <WalletNotice base={base} />
    </div>
  );
}

export function WalletNotice({ base = import.meta.env.BASE_URL ?? "/" }: { base?: string }) {
  return (
    <footer
      style={{
        flex: "none",
        padding: "4px 8px",
        fontSize: "1rem",
        textAlign: "center",
        background: NOTICE_BACKGROUND,
        color: NOTICE_TEXT,
        borderTop: "1px solid #334155",
      }}
    >
      Uses Cartridge Controller, © Cartridge Gaming Company ·{" "}
      <a href={`${base}${NOTICES_PATH}`} target="_blank" rel="noreferrer" style={{ color: NOTICE_LINK, textDecoration: "underline" }}>
        Third-party notices
      </a>
    </footer>
  );
}
