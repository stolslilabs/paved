import { useId, useState } from "react";
import { formatInteger } from "@paved/game-core";
import { NAME_RULES, PLAYER_NAME_MAX, nameLength, nameRules, normalizeName } from "../../lib/name-limit";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { GOLD_ACTION, GoldShine } from "../elements/gold-action";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { SectionTitle } from "../elements/section-title";
import { shortAddress } from "../elements/short-address";
import { TokenIcon } from "../elements/token-icon";
import { CheckBadge } from "../elements/check-badge";
import { UiIcon } from "../elements/ui-icon";
import { DrawerFooter, ViewHeader, useDrawerView } from "./hud-drawer";

/** The view's title, short enough to sit beside the Cobbles and the red cross at 320 px (the pencil's own name is "Edit name"). */
export const RENAME_TITLE = "Name";

export interface RenameViewProps {
  /** The name the player shows now (the chain's, else the Cartridge username); null: none, the short address is shown. */
  current: string | null;
  /** The player's address, the name's stand-in without one. */
  address: string;
  /** The next change's cost in Cobbles, 0 for the first (free); undefined while it is read (the action held). */
  cost: number | undefined;
  /** The player's Cobbles; undefined while they are read. */
  balance: number | undefined;
  /** A rename on its way: the field and the action held, the action's spinner. */
  pending?: boolean;
  /** The name the last rename set: "Renamed" said under the field. */
  done?: string | null;
  /** The last rename's refusal, as the player reads it (`RenameRefusedError`'s text); null: none. */
  refused?: string | null;
  /** That refusal's detail for support (`InlineError`). */
  refusedDetail?: ErrorDetail;
  /** The refusal was the name taken by another player: its rule shows the cross. */
  taken?: boolean;
  /** The reads failed (their message): shown with Retry, the action held. */
  error?: string | null;
  errorDetail?: ErrorDetail;
  onRetry?: () => void;
  /** The field's first value (a story's typed name). */
  defaultName?: string;
  /** Sends the rename of the name typed, at `cost`. */
  onRename?: (name: string) => void;
  /** Changes the name typed: the last refusal is cleared. */
  onType?: () => void;
  /** Back to the profile. */
  onBack: () => void;
}

/** The carved box of the name now and of the new name's field, one size for both (the owner's ask): 44 px, the guild's field's padding. */
const BOX = "drawer-carved min-h-11 w-full min-w-0 rounded-xl px-3 py-2.5 text-base leading-6";
/** The text field. */
const FIELD = `${BOX} font-semibold outline-none placeholder:text-muted-foreground disabled:opacity-50`;

/** Each rule's line, as the player reads it. */
const RULE_TEXT: Record<(typeof NAME_RULES)[number], string> = {
  length: `3 to ${PLAYER_NAME_MAX} characters`,
  characters: "Letters, digits, single spaces or hyphens",
  unique: "Not another player's name",
};

/** A rule's state: met, broken, or not judged yet (the empty field; the name's uniqueness, judged on sending). */
type RuleMark = "met" | "broken" | "open";

/**
 * A rule's painted mark (the owner's ask of 2026-11-07: the green checks and red crosses): the Missions' green check badge when met,
 * the drawers' red cross disc when broken, the badge greyed while not judged. Two discs of one family, 20 px.
 */
function RuleMarkArt({ state }: { state: RuleMark }) {
  if (state === "broken") return <UiIcon name="close" px={20} className="size-5 shrink-0" />;
  return <CheckBadge px={20} className={cn("size-5 shrink-0", state === "open" && "opacity-40 grayscale")} />;
}

/**
 * The profile's name view (PLAYER-RENAME, the owner's ask of 2026-11-07: an edit button beside the player's own name, the first
 * change free, then 50 Cobbles a change): drawn in the Profile drawer in place of the profile, its header "Name" with Back to
 * the profile (`useDrawerView`; outside a drawer, its own `ViewHeader`). The name now, carved; the new name's field with its count
 * of characters and its rules under it, each line marked as the typed name meets it; the fixed footer (`DrawerFooter`), the cost on
 * the left ("Free" for the first change, else the Cobble and the price) and the gold Rename on the right, held while the name breaks
 * a rule or is the current one. What the player can mend is said where it shows, never in the app's error box (the owner's asks of
 * 2026-11-07: that box, with its Copy, is for what failed on the server's side): a broken rule in the warning colour with its
 * red cross; a name taken, its rule's line ("Taken by another player"); too few Cobbles, the field and Rename held and the cost itself
 * ("30 Cobbles missing" over the figure, both in the warning colour). A read that failed, or another refusal of the chain, is the app's
 * error. The success is said under the field, the field emptied, the name shown now the new one. Any script's letters (the owner's ask): the name is sent composed (NFC), its ends trimmed, and its
 * characters are counted as the chain counts them. Controls never move between states.
 */
export function RenameView(props: RenameViewProps) {
  const { current, address, cost, balance, pending = false, done, refused, refusedDetail, taken = false, error, errorDetail, onRetry, onRename, onType, onBack } = props;
  const inDrawer = useDrawerView(RENAME_TITLE, onBack);
  const fieldId = useId();
  const rulesId = useId();
  const [typed, setTyped] = useState(props.defaultName ?? "");
  // A success empties the field: once per name set.
  const [cleared, setCleared] = useState<string | null>(null);
  if (done && cleared !== done) {
    setCleared(done);
    setTyped("");
  }
  const name = normalizeName(typed);
  const rules = nameRules(name);
  const valid = rules.length && rules.characters;
  const same = name !== "" && name === current;
  const short = cost !== undefined && balance !== undefined && balance < cost;
  const missing = short ? cost - balance : 0;
  // A name the chain found taken stays held until another is typed (typing clears the refusal).
  const held = !valid || same || short || taken || cost === undefined || balance === undefined || pending || Boolean(error);
  const mark = (rule: (typeof NAME_RULES)[number]): RuleMark => {
    if (rule === "unique") return taken ? "broken" : "open";
    if (name === "") return "open";
    return rules[rule] ? "met" : "broken";
  };
  return (
    <div data-slot="rename-view" className="flex flex-col gap-4">
      {!inDrawer && <ViewHeader title={RENAME_TITLE} onBack={onBack} />}
      <section aria-label="Your name" className="flex flex-col gap-2">
        <SectionTitle>Your name</SectionTitle>
        <p data-slot="rename-current" className={cn(BOX, "flex items-center")}>
          <span title={current ?? address} className={cn("text-outline min-w-0 font-bold wrap-anywhere", !current && "numeric")}>
            {current ?? `#${shortAddress(address)}`}
          </span>
        </p>
      </section>
      <section aria-label="New name" className="flex flex-col gap-2">
        <SectionTitle end={<CharCount count={nameLength(name)} max={PLAYER_NAME_MAX} />}>
          <label htmlFor={fieldId}>New name</label>
        </SectionTitle>
        <input
          id={fieldId}
          data-slot="rename-field"
          className={FIELD}
          value={typed}
          // UTF-16 units: a character past the Basic Multilingual Plane takes two (the count above is the chain's).
          maxLength={2 * PLAYER_NAME_MAX + 5}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          placeholder="Type a new name"
          disabled={pending || short}
          aria-describedby={rulesId}
          aria-invalid={name !== "" && !valid ? true : undefined}
          onChange={(e) => {
            setTyped(e.target.value);
            onType?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !held) onRename?.(name);
          }}
        />
        <ul id={rulesId} data-slot="rename-rules" className="flex flex-col gap-1.5 px-1">
          {NAME_RULES.map((rule) => {
            const state = mark(rule);
            return (
              <li
                key={rule}
                data-mark={state}
                className={cn("flex items-center gap-2 text-sm font-semibold", state === "met" ? "text-foreground" : state === "broken" ? "text-warning" : "text-muted-foreground")}
              >
                <RuleMarkArt state={state} />
                {/* A name taken: said on its own rule's line, the chain's answer. */}
                <span>{rule === "unique" && taken ? "Taken by another player" : RULE_TEXT[rule]}</span>
                <span className="sr-only">{state === "met" ? ", met" : state === "broken" ? ", not met" : ""}</span>
              </li>
            );
          })}
        </ul>
        {same && <p className="px-1 text-sm font-semibold text-muted-foreground">This is your name already.</p>}
      </section>
      <InlineError title="Names cannot be read" message={error ?? null} detail={errorDetail} action={onRetry && <Button size="sm" onClick={onRetry}>Retry</Button>} />
      {/* A refusal the player cannot mend here (the price changed, the wallet, the network): the app's error. A name taken is its rule's. */}
      <InlineError title="Rename refused" message={pending || taken ? null : (refused ?? null)} detail={refusedDetail} />
      {/* The success, carved (it informs): the painted check and the name every screen now shows. */}
      <div role="status" data-slot="rename-done" className="empty:hidden">
        {done && !pending && (
          <p className="drawer-carved flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold">
            <UiIcon name="check" px={24} className="size-6 shrink-0" />
            <span className="min-w-0 wrap-anywhere">
              Renamed: you are now <span className="text-outline font-bold">{done}</span>.
            </span>
          </p>
        )}
      </div>
      <DrawerFooter>
        <div data-slot="rename-bill" className="flex min-h-16 items-center gap-3 bg-secondary px-4 py-2">
          {/* Too few Cobbles (the owner's asks of 2026-11-07): the cost says how many are missing, in its label's place, both in the
              warning colour; the field and Rename held. The bill keeps its height. */}
          <span role="group" aria-label="Cost" aria-busy={cost === undefined || undefined} data-short={short || undefined} className={cn("flex min-w-0 flex-col", short && "text-warning")}>
            <span className={cn("text-sm leading-tight font-semibold", !short && "text-muted-foreground")}>{short ? `${formatInteger(missing)} Cobbles missing` : "Cost"}</span>
            <span className="flex min-w-0 items-center gap-1.5">
              {cost === undefined ? (
                <span className="numeric text-outline text-lg leading-tight font-bold">…</span>
              ) : cost === 0 ? (
                <span className="text-outline text-lg leading-tight font-bold">Free</span>
              ) : (
                <>
                  <TokenIcon kind="cobbles" size="sm" />
                  <span className="numeric text-outline text-lg leading-tight font-bold">{formatInteger(cost)}</span>
                  <span className="sr-only">Cobbles</span>
                </>
              )}
            </span>
          </span>
          <Button
            variant="ghost"
            // The drawers' gold action (the Challenge's Confirm, the Vault's), its light passing while it can be pressed.
            style={GOLD_ACTION}
            className="relative ml-auto h-12 min-w-36 shrink-0 px-1 text-lg font-black text-foreground mobile:text-xl"
            onClick={held ? undefined : () => onRename?.(name)}
            disabled={held}
            loading={pending}
          >
            {!held && <GoldShine />}
            Rename
          </Button>
        </div>
      </DrawerFooter>
    </div>
  );
}

/** The count of characters at the field's title: "7/15", in the warning colour past the most. */
function CharCount({ count, max }: { count: number; max: number }) {
  return (
    <span aria-hidden className={cn("numeric font-sans text-sm font-bold", count > max ? "text-warning" : "text-muted-foreground")}>
      {formatInteger(count)}/{formatInteger(max)}
    </span>
  );
}
