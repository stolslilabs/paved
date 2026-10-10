/** Where the notices file is served: `public/THIRD_PARTY_NOTICES.txt`, copied to `dist` by `vite build`. */
export const NOTICES_PATH = "THIRD_PARTY_NOTICES.txt";

/**
 * The notice Cartridge's licence asks of every copy of the client (D-15): that Cartridge Controller is used and is
 * Cartridge's copyright, with a link to the full notices and licence text. Shown on every page and network: the
 * controller's code ships in every build, devnet's included.
 */
export function WalletNotice({ base = import.meta.env.BASE_URL ?? "/" }: { base?: string }) {
  return (
    <footer style={{ position: "fixed", left: 8, bottom: 4, zIndex: 10, fontSize: 11, color: "#94a3b8", pointerEvents: "auto" }}>
      Uses Cartridge Controller, © Cartridge Gaming Company ·{" "}
      <a href={`${base}${NOTICES_PATH}`} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
        Third-party notices
      </a>
    </footer>
  );
}
