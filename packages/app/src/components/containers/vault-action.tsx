import { Button } from "../ui/button";
import { amountFigure } from "../elements/amount";
import { GOLD_ACTION, GoldShine } from "../elements/gold-action";
import { TokenIcon } from "../elements/token-icon";
import { OP_WORD, typedAmount, type VaultBusy, type VaultOp } from "./vault-form";

/** The other side of each operation, its word and its token: what the player gets, pays or uses for the amount typed. */
const SIDE: Record<VaultOp, { word: string; token: "paved" | "vpaved" }> = {
  deposit: { word: "You get", token: "vpaved" },
  mint: { word: "You pay", token: "paved" },
  withdraw: { word: "Uses", token: "vpaved" },
  redeem: { word: "You get", token: "paved" },
};

export interface VaultActionProps {
  /** The operation (`opOf`: the tab and the field's unit). */
  op: VaultOp;
  amount: string;
  /** The typed amount's limit (`limitOf`). */
  limit: bigint;
  /** The operation's preview of the typed amount (`useVaultPreview`): its other side; null until read. */
  preview: bigint | null;
  busy?: VaultBusy | null;
  /** Nothing to send: the page's state holds it (the account or a read on its way, a read failed, no economy). */
  disabled?: boolean;
  /** Sends the operation. */
  onSend?: () => void;
}

/**
 * The footer's bill (VAULT-PAGE: the Challenge's, the total on the left and the action on the right; the book's preview beside its gold
 * button): the operation's other side, about: the vPAVED a deposit mints (`preview_deposit`), the PAVED a mint takes (`preview_mint`),
 * the vPAVED a withdraw uses, its exit fee included (`preview_withdraw`), the PAVED a redeem pays, its exit fee taken
 * (`preview_redeem`); the gold Deposit, Mint, Withdraw or Redeem, its word kept and a spinner while its write waits in the wallet (the
 * body says what the wallet asks), so the footer never moves between states. One row from 360 px.
 */
export function VaultAction({ op, amount, limit, preview, busy, disabled, onSend }: VaultActionProps) {
  const { ready } = typedAmount(amount, limit);
  const side = SIDE[op];
  const working = busy != null;
  const figure = !ready ? "0.00" : preview === null ? "…" : `≈ ${amountFigure(preview, side.token, true)}`;
  const held = disabled || !ready || working;
  return (
    <div className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
      <span aria-label={side.word} role="group" className="flex min-w-0 flex-col">
        <span className="text-sm leading-tight font-semibold text-muted-foreground">{side.word}</span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
          {side.token === "vpaved" ? <TokenIcon kind="vpaved" size="sm" /> : <TokenIcon kind="paved" size="sm" />}
          <span className="numeric text-outline text-lg leading-tight font-bold wrap-anywhere">{figure}</span>
          <span className="text-outline text-xs font-bold">{side.token === "vpaved" ? "vPAVED" : "PAVED"}</span>
        </span>
      </span>
      <Button
        variant="ghost"
        // The drawers' gold action (the Challenge's Confirm), its light passing while it can be pressed.
        style={GOLD_ACTION}
        className="relative ml-auto h-12 min-w-36 shrink-0 px-1 text-lg font-black text-foreground mobile:text-xl"
        onClick={onSend}
        disabled={held}
        loading={busy === op}
      >
        {!held && <GoldShine />}
        {OP_WORD[op]}
      </Button>
    </div>
  );
}
