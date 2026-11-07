import type { ReactNode } from "react";
import type { SplitView, VaultPosition as Position } from "@paved/chain";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { Tabs, TabsContent } from "../ui/tabs";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { VaultArtImage } from "../elements/vault-art-image";
import { BalancesSlot } from "../containers/balances-context";
import type { ShownBalance } from "../containers/balances";
import { FooterTab, FooterTabsList } from "../containers/footer-tabs";
import { DrawerFooter, HudDrawer } from "../containers/hud-drawer";
import { VaultAction } from "../containers/vault-action";
import { limitOf, opOf, VaultForm, type VaultBusy, type VaultDone, type VaultTab, type VaultUnit } from "../containers/vault-form";
import { VaultPosition } from "../containers/vault-position";

/**
 * Where the page stands before a position is shown: the account or the reads on their way (`loading`: every player has an account,
 * the owner's ruling of 2026-11-07, so no guest state), or a read that failed (`error`, with Retry). Left out, the position (or "not
 * deployed") is shown.
 */
export type VaultStatus = { kind: "loading" } | { kind: "error"; message: string; detail?: ErrorDetail };

/** The line under the drawer's title (the book's). */
const INTRO = "Deposit PAVED for vPAVED.";

/** The balances at the header's end, the book's: PAVED (what a deposit takes) over vPAVED (what it gives), shown even at zero (#855). */
const BALANCES: readonly ShownBalance[] = ["paved", "vpaved"];

/** The footer's tabs (the owner's ask of 2026-11-07): the Position first, then the book's Deposit and Withdraw. */
const TABS: readonly { id: VaultTab; label: string }[] = [
  { id: "position", label: "Position" },
  { id: "deposit", label: "Deposit" },
  { id: "withdraw", label: "Withdraw" },
];

/** Each tab's painted icon, 36 px (`vault-art.ts`): the silver coins held, the gold coin into silver, the silver back into gold. */
const TAB_ART = {
  position: <VaultArtImage name="position" px={36} className="drawer-icon size-9" />,
  deposit: <VaultArtImage name="deposit" px={36} className="drawer-icon size-9" />,
  withdraw: <VaultArtImage name="withdraw" px={36} className="drawer-icon size-9" />,
} as const satisfies Record<VaultTab, ReactNode>;

export interface VaultSceneProps {
  /** The economy's addresses are configured (`EconomyDeployment.configured`); false: nothing to read or send. */
  deployed: boolean;
  status?: VaultStatus | null;
  /** The viewer's position (`EconomyViews.vault`); null when not deployed. */
  position: Position | null;
  /** PAVED in the wallet (`pavedBalance`). */
  balance: bigint;
  /** `Economy.split_bps()`: the Vault's part of each purchase. */
  split: SplitView | null;
  /** `Economy.rate()`, the guard's swap rate (PAVED base units per USDC base unit x 1e18): the dollar figures; null or 0, none. */
  guardRate?: bigint | null;
  /** The footer's tab, the URL's (`?tab=`): the Position, Deposit or Withdraw. */
  mode: VaultTab;
  /** The field's unit (the book's switch): PAVED (Deposit, Withdraw) or vPAVED (Mint, Redeem). PAVED when omitted. */
  unit?: VaultUnit;
  /** The amount typed, in the field's unit. */
  amount: string;
  /** The operation's preview of the typed amount (`useVaultPreview`): its other side; null until read. */
  preview: bigint | null;
  busy?: VaultBusy | null;
  /** The last write's refusal (the writer's typed message). */
  refused?: string | null;
  refusedDetail?: ErrorDetail;
  /** The last write went through: its receipt's PAVED and vPAVED. */
  done?: VaultDone | null;
  /** The drawer is open (its route the current one); omitted, open. */
  open?: boolean;
  /** Where the focus goes back on close: the HUD's control that opened it. */
  returnFocus?: () => HTMLElement | null;
  onRetry?: () => void;
  onModeChange?: (mode: VaultTab) => void;
  onAmountChange?: (amount: string) => void;
  onUnitChange?: (unit: VaultUnit) => void;
  onMax?: () => void;
  onDeposit?: () => void;
  /** A deposit with its vPAVED fixed: `mint(shares)`. */
  onMint?: () => void;
  onWithdraw?: () => void;
  /** A withdraw with its vPAVED fixed: `redeem(shares)`. */
  onRedeem?: () => void;
  onWithdrawAll?: () => void;
  onPlay?: () => void;
  /** The drawer's close, back to the page it was opened from. */
  onBack?: () => void;
}

/** A press on a dialog over the drawer (the wallet's) is no tap on the village. */
const keepForDialogs = (event: Event) => {
  if ((event.target as Element | null)?.closest?.("[role=dialog], [role=alertdialog]")) event.preventDefault();
};

/**
 * The Vault (`/vault`, V1b's vPAVED, P-56; VAULT-PAGE, after the Paved UX Book's "vault" and "vault-withdraw" and the Challenge's stake
 * panel): the HUD's drawer, docked at the right from `tablet` (the home's right column holds the Vault), its title with the book's line
 * under it and PAVED over vPAVED at its header's end. Three tabs in the footer, a bottom navigation (`FooterTabsList`, the URL's
 * `?tab=`; the owner's ask of 2026-11-07): the Position (`VaultPosition`: the vPAVED in its light, their worth, what leaves now, the exit
 * fee, the rates, the notes), Deposit and Withdraw (`VaultForm`), each form with the bill over the tabs (what the player gets, the gold
 * action, `VaultAction`). A tab's two operations by the field's unit (the book's switch): Deposit or Mint, Withdraw or Redeem (ERC4626's
 * four); and Withdraw all, each exit with its fee shown before it is sent. No stake, no claim, no
 * dividend: the rate is the reward. The account or a read on its way shows the page's shape, a failed one has
 * Retry, an economy not deployed says so; the tabs stay at the foot whatever the state.
 */
export function VaultScene(props: VaultSceneProps) {
  const { deployed, position, balance, split, status, mode, busy, unit = "paved" } = props;
  const working = busy != null;
  const ready = !status && deployed && position !== null;
  // The Position has no form: its op is never sent (the bill is the forms' only).
  const form = mode !== "position";
  const op = opOf(form ? mode : "deposit", unit);
  const limit = !ready ? 0n : limitOf(op, { ...position, balance });
  const send = { deposit: props.onDeposit, mint: props.onMint, withdraw: props.onWithdraw, redeem: props.onRedeem }[op];

  let body: ReactNode;
  if (status?.kind === "error") {
    body = <InlineError title="The Vault cannot be read" message={status.message} detail={status.detail} action={<Button size="sm" onClick={props.onRetry}>Retry</Button>} />;
  } else if (status?.kind === "loading") {
    body = (
      <div role="status" aria-label="Reading the Vault" className="flex flex-col gap-3">
        <Skeleton className="h-9 w-40 rounded-lg" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
    );
  } else if (!ready) {
    body = (
      <Notice tone="warning" title="Economy not deployed">
        This network has no Vault yet: there is nothing to deposit or withdraw. Training and Story mode still play.
      </Notice>
    );
  }

  return (
    <HudDrawer
      open={props.open ?? true}
      onOpenChange={(next) => {
        if (!next) props.onBack?.();
      }}
      title="Vault"
      subtitle={INTRO}
      side="right"
      slot="vault"
      returnFocus={props.returnFocus}
      end={<BalancesSlot layout="pill" kinds={BALANCES} direction="column" />}
      onInteractOutside={keepForDialogs}
    >
      <Tabs
        value={mode}
        onValueChange={(next) => {
          // Radix calls it twice on a press: once is enough.
          if (next !== mode) props.onModeChange?.(next as VaultTab);
        }}
        className="flex-1 gap-5"
      >
        <TabsContent value="position" className="flex flex-col gap-3">
          {ready ? <VaultPosition position={position} guardRate={props.guardRate} split={split} /> : body}
        </TabsContent>
        {(["deposit", "withdraw"] as const).map((id) => (
          <TabsContent key={id} value={id} className="flex flex-col gap-3">
            {ready ? (
              <VaultForm
                mode={id}
                unit={unit}
                amount={props.amount}
                balance={balance}
                shares={position.shares}
                value={position.value}
                maxWithdraw={position.maxWithdraw}
                exitFeeBps={position.exitFeeBps}
                totalAssets={position.totalAssets}
                totalSupply={position.totalSupply}
                preview={props.preview}
                busy={busy}
                refused={props.refused}
                refusedDetail={props.refusedDetail}
                done={props.done}
                onAmountChange={props.onAmountChange}
                onUnitChange={props.onUnitChange}
                onMax={props.onMax}
                onWithdrawAll={props.onWithdrawAll}
                onPlay={props.onPlay}
                split={split}
                guardRate={props.guardRate}
              />
            ) : (
              body
            )}
          </TabsContent>
        ))}
        <DrawerFooter>
          {/* The bill on the body's charcoal, so the current tab hangs from the page (FOOTER-TABS). */}
          <div data-slot="vault-footer" className="flex flex-col">
            {/* The bill is the forms' (the Position sends nothing): it shows over the tabs on Deposit and Withdraw. */}
            {form && (
              <div className="bg-secondary">
                <VaultAction op={op} amount={ready ? props.amount : ""} limit={limit} preview={props.preview} busy={busy} disabled={!ready} onSend={send} />
              </div>
            )}
            <FooterTabsList aria-label="Vault">
              {TABS.map(({ id, label }) => (
                <FooterTab
                  key={id}
                  value={id}
                  label={label}
                  disabled={working}
                  art={TAB_ART[id]}
                />
              ))}
            </FooterTabsList>
          </div>
        </DrawerFooter>
      </Tabs>
    </HudDrawer>
  );
}
