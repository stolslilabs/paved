import { Button } from "../components/ui/button";
import { InlineError } from "../components/elements/inline-error";
import { shortAddress } from "../components/elements/short-address";
import { errorDetail } from "../routes/error-detail";
import { useWallet } from "./wallet";

/** Where the notices file is served: `public/THIRD_PARTY_NOTICES.txt`, copied to `dist` by `vite build`. */
export const NOTICES_PATH = "THIRD_PARTY_NOTICES.txt";

/**
 * The notice Cartridge's licence asks of every copy of the client (D-15, made prominent by D-16; app-web's
 * `WalletNotice.tsx`): Cartridge Controller is used and is Cartridge's copyright, with a link to the full notices and
 * licence text. The footer shows it at body size, in normal flow below the page so it covers nothing, on an opaque bar;
 * the board routes, which have no footer, show it compact under the board's header (`BoardScene`'s `footnote`).
 */
export function WalletNotice({ base = import.meta.env.BASE_URL }: { base?: string }) {
  return (
    <span>
      Uses Cartridge Controller, © Cartridge Gaming Company ·{" "}
      <a href={`${base}${NOTICES_PATH}`} target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-2">
        Third-party notices
      </a>
    </span>
  );
}

/**
 * The shell's footer (section 6.3): the D-15 notice on every page, and the connected account with Disconnect (the
 * settings' account row is P11's).
 */
export function WalletFooter() {
  const wallet = useWallet();
  return (
    <footer className="flex flex-none flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border bg-ink-950 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-center text-base text-muted-foreground">
      <WalletNotice />
      {wallet.address && (
        <span className="flex items-center gap-2">
          <span className="wrap-anywhere">
            Connected as <span className="text-foreground">{wallet.username ?? shortAddress(wallet.address)}</span>
          </span>
          <Button size="sm" variant="ghost" onClick={wallet.disconnect}>
            Disconnect
          </Button>
        </span>
      )}
      <InlineError title="Wallet" message={wallet.address ? null : wallet.error} detail={wallet.error ? errorDetail(wallet.error) : undefined} className="w-full text-left" />
    </footer>
  );
}
