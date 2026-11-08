import { useId, useState } from "react";
import { ALLIANCE_DESCRIPTION_MAX, ALLIANCE_NAME_MAX, allianceNameRefusal, allianceSettingsInvalid, type AllianceDraft } from "@paved/game-core";
import { ALLIANCE_REFUSALS } from "../../lib/alliance-text";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { AllianceEmblem } from "../elements/alliance-emblem";
import { InlineError } from "../elements/inline-error";
import { CharCount, EmblemFields, FIELD, FormSection } from "./guild-sheets";

/** A new alliance's settings: the first charge on Stone and Gold, its charge Silver (the guild form's first emblem's look). */
export const NEW_ALLIANCE: AllianceDraft = { name: "", emblem: { icon: 0, primary: 4, secondary: 0 }, description: "" };

export interface AllianceFormProps {
  /** Creating (with a name) or editing the head guild leader's settings. */
  mode: "create" | "edit";
  /** Where the form starts: `NEW_ALLIANCE`, or the alliance's settings. */
  initial: AllianceDraft;
  onSubmit?: (draft: AllianceDraft) => void;
  pending?: boolean;
  /** Why the source refused it, in words. */
  error?: string | null;
}

/**
 * Creating an alliance, or its leader editing its settings (ALLIANCES), the guild form's look and parts: the emblem as it will look on
 * its laurel beside the name on a carved band, the name (creating only: 3 to 20 letters, digits and spaces), the emblem's picker (a
 * guild's charges and colours), the description (150 characters). No join type or requirement: a guild's leader asks, the alliance's
 * leader answers. Free in this step. Create or Save a raised button.
 */
export function AllianceForm({ mode, initial, onSubmit, pending, error }: AllianceFormProps) {
  const [draft, setDraft] = useState(initial);
  const set = (change: Partial<AllianceDraft>) => setDraft((d) => ({ ...d, ...change }));
  const invalid = (mode === "create" ? allianceNameRefusal(draft.name) : null) ?? allianceSettingsInvalid(draft);
  const shown = draft.name.trim() === "" && mode === "create" ? null : invalid;
  const nameId = useId();
  const descriptionId = useId();
  const name = mode === "create" ? draft.name.trim() : initial.name;
  return (
    <form
      data-slot="alliance-form"
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid) onSubmit?.(mode === "create" ? draft : { ...draft, name: initial.name });
      }}
    >
      {/* The emblem as it will look, beside the name. */}
      <div data-slot="alliance-form-preview" className="drawer-carved flex min-w-0 items-center gap-3 rounded-xl p-3">
        <AllianceEmblem emblem={draft.emblem} size="md" />
        <p className={cn("text-outline min-w-0 flex-1 text-xl leading-tight font-bold wrap-anywhere", name === "" && "text-muted-foreground")}>{name === "" ? "Your alliance" : name}</p>
      </div>

      {mode === "create" && (
        <FormSection title="Name" count={<CharCount count={draft.name.trim().length} max={ALLIANCE_NAME_MAX} />}>
          <input id={nameId} aria-label="Name" className={FIELD} value={draft.name} maxLength={ALLIANCE_NAME_MAX + 5} autoComplete="off" placeholder="Stone Pact" onChange={(e) => set({ name: e.target.value })} />
        </FormSection>
      )}

      <EmblemFields emblem={draft.emblem} onChange={(emblem) => set({ emblem })} />

      <FormSection title="Description" count={<CharCount count={draft.description.length} max={ALLIANCE_DESCRIPTION_MAX} />}>
        <textarea id={descriptionId} aria-label="Description" rows={3} className={cn(FIELD, "resize-none")} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
      </FormSection>

      <InlineError title={mode === "create" ? "Create" : "Settings"} message={error ?? (shown ? ALLIANCE_REFUSALS[shown] : null)} />
      <Button type="submit" variant="ghost" disabled={invalid !== null} loading={pending} className="state-layer drawer-tile text-outline h-12 w-full rounded-xl text-base font-bold">
        {mode === "create" ? "Create the alliance" : "Save"}
      </Button>
    </form>
  );
}
