import { useId, useState, type CSSProperties, type ReactNode } from "react";
import {
  GUILD_DESCRIPTION_MAX,
  GUILD_EMBLEM_SILVER,
  GUILD_JOIN_TYPES,
  GUILD_MAX_CROWNS_REQUIRED,
  GUILD_NAME_MAX,
  LEVEL_CAP,
  formatInteger,
  guildNameRefusal,
  guildSettingsInvalid,
  type GuildDraft,
  type GuildJoinType,
  type GuildSettings,
} from "@paved/game-core";
import { JOIN_TYPES, REFUSALS, guildErrorText } from "../../lib/guild-text";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Icon } from "../ui/icon";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { EmblemCharge, GUILD_EMBLEM_CHARGES, GUILD_EMBLEM_COLOUR_NAMES, GUILD_EMBLEM_PALETTE, GuildEmblem } from "../elements/guild-emblem";
import { InlineError } from "../elements/inline-error";
import { SectionTitle } from "../elements/section-title";
import { UiIcon } from "../elements/ui-icon";

/** A field written into, carved (the drawer's: carved informs, and holds what is typed). */
const FIELD = "drawer-carved w-full min-w-0 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none placeholder:text-muted-foreground";
/** The emblem's grids, six to a row (the owner's ask of 2026-11-05: the charges and colours fill the width); inline, no CSS of its own. */
const SIX: CSSProperties = { gridTemplateColumns: "repeat(6, minmax(0, 1fr))" };
/** A cell of the emblem's grids. */
const CELL = "aspect-square h-auto w-full min-w-0 rounded-xl bg-transparent px-0";

/**
 * A section of the form, the drawer's: its engraved title in the display font, a fixed word (TILE-COUNTS), then its content, then
 * what counts it (the characters typed) on a line of its own under it, at the right.
 */
function FormSection({ title, count, children }: { title: string; count?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <SectionTitle>{title}</SectionTitle>
      {children}
      {count && <div className="-mt-1 flex justify-end px-1">{count}</div>}
    </section>
  );
}

/** A count of characters under its field, at the right: "83/150", in the warning colour past its maximum. */
function CharCount({ count, max }: { count: number; max: number }) {
  return (
    <span aria-hidden className={cn("numeric font-sans text-sm font-bold", count > max ? "text-warning" : "text-muted-foreground")}>
      {formatInteger(count)}/{formatInteger(max)}
    </span>
  );
}

/** A confirmation's text field, on the dialog's surface (not the drawer's). */
const DIALOG_FIELD = "w-full min-w-0 rounded-lg border border-input bg-secondary/60 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground";

/** A confirmation's labelled field, with its count of characters when it has a maximum. */
function Field({ label, count, max, children }: { label: string; count?: number; max?: number; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        {max !== undefined && (
          <span aria-hidden className={cn("numeric text-xs", (count ?? 0) > max ? "text-warning" : "text-muted-foreground")}>
            {formatInteger(count ?? 0)}/{formatInteger(max)}
          </span>
        )}
      </div>
      {children(id)}
    </div>
  );
}

/** A whole number from a field, clamped to 0 and `max`. */
const count = (text: string, max: number): number => Math.min(max, Math.max(0, Math.floor(Number(text) || 0)));

/** The emblem's three colours as the picker names them (the charge's, GUILD-PAGE: its silhouette's). */
const PART_NAMES = { primary: "Shield", secondary: "Band", charge: "Charge" } as const;

/** A new guild's settings: Open, no requirements, the first emblem. */
export const NEW_GUILD: GuildDraft = { name: "", emblem: { icon: 0, primary: 0, secondary: 7 }, description: "", joinType: "open", requirements: { level: 0, crowns: 0 } };

export interface GuildFormProps {
  /** Creating (with a name) or editing the leader's settings. */
  mode: "create" | "edit";
  /** Where the form starts: `NEW_GUILD`, or the guild's settings. */
  initial: GuildDraft;
  onSubmit?: (draft: GuildDraft) => void;
  pending?: boolean;
  /** Why the source refused it, in words. */
  error?: string | null;
}

/**
 * Creating a guild, or the leader editing its settings (#953): the name (creating only: 3 to 20 letters, digits and spaces),
 * the emblem (a charge and three colours), the description (150 characters), the join type and the requirements. Free in this
 * step. GUILD-PAGE: a view in the guild's drawer, in its style (the owner's ask of 2026-11-05): the emblem as it will look on a carved
 * band, then each part under the drawer's engraved title; the charges and the colours on carved panels, six to a row; the join types
 * raised tiles under their painted icons; the fields carved; Save a raised button.
 */
export function GuildForm({ mode, initial, onSubmit, pending, error }: GuildFormProps) {
  const [draft, setDraft] = useState(initial);
  const set = (change: Partial<GuildDraft>) => setDraft((d) => ({ ...d, ...change }));
  const settings: GuildSettings = { emblem: draft.emblem, description: draft.description, joinType: draft.joinType, requirements: draft.requirements };
  const invalid = (mode === "create" ? guildNameRefusal(draft.name) : null) ?? guildSettingsInvalid(settings);
  const shown = draft.name.trim() === "" && mode === "create" ? null : invalid;
  const nameId = useId();
  const descriptionId = useId();
  const name = mode === "create" ? draft.name.trim() : initial.name;
  return (
    <form
      data-slot="guild-form"
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid) onSubmit?.(mode === "create" ? draft : { ...draft, name: initial.name });
      }}
    >
      {/* The emblem as it will look, beside the name. */}
      <div data-slot="guild-form-preview" className="drawer-carved flex min-w-0 items-center gap-3 rounded-xl p-3">
        <GuildEmblem emblem={draft.emblem} size="lg" />
        <p className={cn("text-outline min-w-0 flex-1 text-xl leading-tight font-bold wrap-anywhere", name === "" && "text-muted-foreground")}>{name === "" ? "Your guild" : name}</p>
      </div>

      {mode === "create" && (
        <FormSection title="Name" count={<CharCount count={draft.name.trim().length} max={GUILD_NAME_MAX} />}>
          <input id={nameId} aria-label="Name" className={FIELD} value={draft.name} maxLength={GUILD_NAME_MAX + 5} autoComplete="off" placeholder="The Quarrymen" onChange={(e) => set({ name: e.target.value })} />
        </FormSection>
      )}

      <FormSection title="Emblem">
        <div className="drawer-carved flex flex-col gap-3 rounded-xl p-2">
          <ToggleGroup type="single" aria-label="Icon" className="grid w-full gap-1" style={SIX} value={String(draft.emblem.icon)} onValueChange={(v) => v && set({ emblem: { ...draft.emblem, icon: Number(v) } })}>
            {GUILD_EMBLEM_CHARGES.map((charge, i) => (
              <ToggleGroupItem key={charge} value={String(i)} aria-label={charge} className={CELL}>
                <EmblemCharge name={charge} className="size-7" />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {(["primary", "secondary", "charge"] as const).map((part) => (
            <div key={part} className="flex flex-col gap-1">
              <span aria-hidden className="px-1 text-xs font-bold text-muted-foreground">
                {PART_NAMES[part]}
              </span>
              <ToggleGroup
                type="single"
                aria-label={`${PART_NAMES[part]} colour`}
                className="grid w-full gap-1" style={SIX}
                value={String(draft.emblem[part] ?? GUILD_EMBLEM_SILVER)}
                onValueChange={(v) => v && set({ emblem: { ...draft.emblem, [part]: Number(v) } })}
              >
                {GUILD_EMBLEM_PALETTE.map((i) => (
                  <ToggleGroupItem key={i} value={String(i)} aria-label={`${PART_NAMES[part]}: ${GUILD_EMBLEM_COLOUR_NAMES[i]}`} className={CELL}>
                    <span aria-hidden className="size-7 rounded-full border-2 border-background" style={{ background: `var(--emblem-${i})` }} />
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          ))}
        </div>
      </FormSection>

      <FormSection title="Description" count={<CharCount count={draft.description.length} max={GUILD_DESCRIPTION_MAX} />}>
        <textarea id={descriptionId} aria-label="Description" rows={3} className={cn(FIELD, "resize-none")} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
      </FormSection>

      <FormSection title="Who can join">
        <ToggleGroup type="single" aria-label="Who can join" className="grid w-full grid-cols-3 gap-2" value={draft.joinType} onValueChange={(v) => v && set({ joinType: v as GuildJoinType })}>
          {GUILD_JOIN_TYPES.map((t) => (
            <ToggleGroupItem key={t} value={t} className="drawer-tile text-outline h-auto w-full min-w-0 flex-col gap-1 rounded-xl px-1 py-2.5 text-xs font-bold whitespace-normal">
              <UiIcon name={JOIN_TYPES[t].art} px={32} className="drawer-icon size-8" />
              {JOIN_TYPES[t].label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-xs font-semibold text-muted-foreground">{JOIN_TYPES[draft.joinType].line}</p>
      </FormSection>

      <FormSection title="Requirements">
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              { key: "level", label: "Minimum level", art: "level-star", max: LEVEL_CAP },
              { key: "crowns", label: "Minimum crowns", art: "crown", max: GUILD_MAX_CROWNS_REQUIRED },
            ] as const
          ).map((r) => (
            <label key={r.key} className="flex min-w-0 flex-col gap-1">
              <span className="px-1 text-xs font-bold text-muted-foreground">{r.label}</span>
              <span className="drawer-carved flex min-w-0 items-center gap-2 rounded-xl px-3">
                <UiIcon name={r.art} px={20} className="size-5" />
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={r.max}
                  className="numeric min-w-0 flex-1 bg-transparent py-2.5 text-sm font-bold outline-none"
                  value={draft.requirements[r.key]}
                  onChange={(e) => set({ requirements: { ...draft.requirements, [r.key]: count(e.target.value, r.max) } })}
                />
              </span>
            </label>
          ))}
        </div>
      </FormSection>

      <InlineError title={mode === "create" ? "Create" : "Settings"} message={error ?? (shown ? REFUSALS[shown] : null)} />
      <Button type="submit" variant="ghost" disabled={invalid !== null} loading={pending} className="state-layer drawer-tile text-outline h-12 w-full rounded-xl text-base font-bold">
        {mode === "create" ? "Create the guild" : "Save"}
      </Button>
    </form>
  );
}

/** What a confirmation asks: its words, and an optional text (a kick's reason, a request's message, an announcement). */
export interface GuildConfirmation {
  title: string;
  text: string;
  confirm: string;
  /** Kicking, leaving, disbanding: the confirm button in the destructive colour. */
  destructive?: boolean;
  /** A text to write: its label, its maximum, whether it may be left empty, and where it starts. */
  field?: { label: string; max: number; optional?: boolean; initial?: string; rows?: number };
}

export interface GuildConfirmDialogProps {
  /** What it asks; null: closed. */
  confirmation: GuildConfirmation | null;
  onCancel: () => void;
  /** Confirmed, with the text written ("" without a field). */
  onConfirm: (text: string) => void;
  pending?: boolean;
  error?: string | null;
}

/** One confirmation of a guild action (#953): promote, demote, kick (with a reason), make leader, leave, disband, request, post. */
export function GuildConfirmDialog({ confirmation, onCancel, onConfirm, pending, error }: GuildConfirmDialogProps) {
  return (
    <Dialog open={confirmation !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent data-slot="guild-confirm">{confirmation && <ConfirmBody key={confirmation.title} confirmation={confirmation} onCancel={onCancel} onConfirm={onConfirm} pending={pending} error={error} />}</DialogContent>
    </Dialog>
  );
}

function ConfirmBody({ confirmation: c, onCancel, onConfirm, pending, error }: Omit<GuildConfirmDialogProps, "confirmation"> & { confirmation: GuildConfirmation }) {
  const [text, setText] = useState(c.field?.initial ?? "");
  const tooLong = c.field !== undefined && text.length > c.field.max;
  const empty = c.field !== undefined && !c.field.optional && text.trim() === "";
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!tooLong && !empty) onConfirm(text);
      }}
    >
      <DialogHeader>
        <DialogTitle className="wrap-anywhere">{c.title}</DialogTitle>
        <DialogDescription>{c.text}</DialogDescription>
      </DialogHeader>
      {c.field && (
        <Field label={c.field.optional ? `${c.field.label} (optional)` : c.field.label} count={text.length} max={c.field.max}>
          {(id) => <textarea id={id} rows={c.field!.rows ?? 2} className={cn(DIALOG_FIELD, "resize-none")} value={text} onChange={(e) => setText(e.target.value)} />}
        </Field>
      )}
      <InlineError title={c.confirm} message={error ?? null} />
      <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant={c.destructive ? "destructive" : "default"} disabled={tooLong || empty} loading={pending}>
          {c.confirm}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * The guild actions of a page or a profile: `run` one at once (Join), or `ask` its confirmation first (Kick, Leave), then run
 * it with the text written. A refused action keeps its dialog open with why; done, the dialog closes. `onAction` returns the
 * write's promise. The follows (#954) use it too, with their refusals' words (`errorText`).
 */
export function useGuildActions<A>(onAction?: (action: A) => Promise<unknown> | void, errorText: (error: unknown) => string = guildErrorText) {
  const [asking, setAsking] = useState<{ confirmation: GuildConfirmation; make: (text: string) => A } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: A): Promise<boolean> => {
    setPending(true);
    setError(null);
    try {
      await onAction?.(action);
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setPending(false);
    }
  };
  const ask = (confirmation: GuildConfirmation, make: (text: string) => A) => {
    setError(null);
    setAsking({ confirmation, make });
  };
  const dialog = (
    <GuildConfirmDialog
      confirmation={asking?.confirmation ?? null}
      onCancel={() => setAsking(null)}
      onConfirm={(text) => {
        if (!asking) return;
        void run(asking.make(text)).then((done) => done && setAsking(null));
      }}
      pending={pending}
      error={asking ? error : null}
    />
  );
  return { run, ask, dialog, pending, error: asking ? null : error };
}
