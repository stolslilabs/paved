import { useId, useState, type ReactNode } from "react";
import {
  GUILD_DESCRIPTION_MAX,
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
import { useSidePanel } from "../../lib/side-panel";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { GUILD_EMBLEM_COLOUR_NAMES, GUILD_EMBLEM_ICON_NAMES, GuildEmblem } from "../elements/guild-emblem";
import { InlineError } from "../elements/inline-error";

/** The side panel from `desktop`; the bottom sheet under it. */
const DESKTOP_QUERY = "(min-width: 64rem)";

const FIELD = "w-full min-w-0 rounded-lg border border-input bg-secondary/60 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

/** A labelled field, with its count of characters when it has a maximum. */
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

/** A new guild's settings: Open, no requirements, the first emblem. */
export const NEW_GUILD: GuildDraft = { name: "", emblem: { icon: 0, primary: 0, secondary: 7 }, description: "", joinType: "open", requirements: { level: 0, crowns: 0 } };

export interface GuildFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
 * the emblem (an icon and two colours), the description (150 characters), the join type and the requirements. Free in this
 * step. A bottom sheet on a phone, a panel from the right from `desktop`.
 */
export function GuildFormSheet({ open, onOpenChange, mode, initial, onSubmit, pending, error }: GuildFormSheetProps) {
  const desktop = useSidePanel(DESKTOP_QUERY);
  const [draft, setDraft] = useState(initial);
  const set = (change: Partial<GuildDraft>) => setDraft((d) => ({ ...d, ...change }));
  const settings: GuildSettings = { emblem: draft.emblem, description: draft.description, joinType: draft.joinType, requirements: draft.requirements };
  const invalid = (mode === "create" ? guildNameRefusal(draft.name) : null) ?? guildSettingsInvalid(settings);
  const shown = draft.name.trim() === "" && mode === "create" ? null : invalid;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={desktop ? "right" : "bottom"} data-slot="guild-form" className="max-h-[92dvh]">
        <SheetHeader>
          <SheetTitle>{mode === "create" ? "Create a guild" : "Guild settings"}</SheetTitle>
          <SheetDescription>{mode === "create" ? "Free for now. You become its Leader." : "Only the leader changes these."}</SheetDescription>
        </SheetHeader>
        <ScrollRegion className="-mx-6 min-h-0 px-6">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!invalid) onSubmit?.(mode === "create" ? draft : { ...draft, name: initial.name });
            }}
          >
            <div className="flex items-center gap-3">
              <GuildEmblem emblem={draft.emblem} size="lg" />
              {mode === "create" ? (
                <div className="min-w-0 flex-1">
                  <Field label="Name" count={draft.name.trim().length} max={GUILD_NAME_MAX}>
                    {(id) => <input id={id} className={FIELD} value={draft.name} maxLength={GUILD_NAME_MAX + 5} autoComplete="off" placeholder="The Quarrymen" onChange={(e) => set({ name: e.target.value })} />}
                  </Field>
                </div>
              ) : (
                <p className="min-w-0 flex-1 font-semibold wrap-anywhere">{initial.name}</p>
              )}
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-sm font-semibold">Emblem</legend>
              <ToggleGroup type="single" aria-label="Icon" className="flex-wrap" value={String(draft.emblem.icon)} onValueChange={(v) => v && set({ emblem: { ...draft.emblem, icon: Number(v) } })}>
                {GUILD_EMBLEM_ICON_NAMES.map((name, i) => (
                  <ToggleGroupItem key={name} value={String(i)} aria-label={name.replace("-", " ")}>
                    <Icon name={name} size="sm" fixedWidth />
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {(["primary", "secondary"] as const).map((part) => (
                <div key={part} className="flex flex-col gap-1">
                  <span aria-hidden className="text-xs text-muted-foreground">
                    {part === "primary" ? "Shield" : "Band"}
                  </span>
                  <ToggleGroup
                    type="single"
                    aria-label={part === "primary" ? "Shield colour" : "Band colour"}
                    className="flex-wrap"
                    value={String(draft.emblem[part])}
                    onValueChange={(v) => v && set({ emblem: { ...draft.emblem, [part]: Number(v) } })}
                  >
                    {GUILD_EMBLEM_COLOUR_NAMES.map((name, i) => (
                      <ToggleGroupItem key={name} value={String(i)} aria-label={`${part === "primary" ? "Shield" : "Band"}: ${name}`}>
                        <span aria-hidden className="size-5 rounded-full border border-input" style={{ background: `var(--emblem-${i})` }} />
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
              ))}
            </fieldset>

            <Field label="Description" count={draft.description.length} max={GUILD_DESCRIPTION_MAX}>
              {(id) => <textarea id={id} rows={3} className={cn(FIELD, "resize-none")} value={draft.description} onChange={(e) => set({ description: e.target.value })} />}
            </Field>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-semibold">Who can join</legend>
              <ToggleGroup type="single" aria-label="Who can join" className="flex-wrap" value={draft.joinType} onValueChange={(v) => v && set({ joinType: v as GuildJoinType })}>
                {GUILD_JOIN_TYPES.map((t) => (
                  <ToggleGroupItem key={t} value={t}>
                    <Icon name={JOIN_TYPES[t].icon} size="xs" fixedWidth />
                    {JOIN_TYPES[t].label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">{JOIN_TYPES[draft.joinType].line}</p>
            </fieldset>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Minimum level">
                {(id) => <input id={id} type="number" inputMode="numeric" min={0} max={LEVEL_CAP} className={cn(FIELD, "numeric")} value={draft.requirements.level} onChange={(e) => set({ requirements: { ...draft.requirements, level: count(e.target.value, LEVEL_CAP) } })} />}
              </Field>
              <Field label="Minimum crowns">
                {(id) => (
                  <input id={id} type="number" inputMode="numeric" min={0} max={GUILD_MAX_CROWNS_REQUIRED} className={cn(FIELD, "numeric")} value={draft.requirements.crowns} onChange={(e) => set({ requirements: { ...draft.requirements, crowns: count(e.target.value, GUILD_MAX_CROWNS_REQUIRED) } })} />
                )}
              </Field>
            </div>

            <InlineError title={mode === "create" ? "Create" : "Settings"} message={error ?? (shown ? REFUSALS[shown] : null)} />
            <Button type="submit" disabled={invalid !== null} loading={pending}>
              {mode === "create" ? "Create the guild" : "Save"}
            </Button>
          </form>
        </ScrollRegion>
      </SheetContent>
    </Sheet>
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
          {(id) => <textarea id={id} rows={c.field!.rows ?? 2} className={cn(FIELD, "resize-none")} value={text} onChange={(e) => setText(e.target.value)} />}
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
 * write's promise.
 */
export function useGuildActions<A>(onAction?: (action: A) => Promise<unknown> | void) {
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
      setError(guildErrorText(e));
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
