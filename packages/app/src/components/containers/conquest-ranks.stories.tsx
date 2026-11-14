import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CONQUEST_PARTS } from "../../mocks/conquest";
import { ConquestFinalCard, ConquestMembers, ConquestPhaseCard, ConquestRanks } from "./conquest-ranks";

/** The Conquest's lists and results: the allegiances by points, the allegiance's members, a phase's result and the final one. */
const meta = {
  title: "Containers/ConquestRanks",
  component: ConquestRanks,
  args: { label: "Allegiances by points", className: "max-w-sm" },
} satisfies Meta<typeof ConquestRanks>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ranking: Story = { args: { rows: CONQUEST_PARTS.ranking.rows } };
/** One phase's points alone. */
export const Phase: Story = { args: { rows: CONQUEST_PARTS.ranking.rows, phase: "foundation" } };
export const Members: Story = { args: { rows: [] }, render: () => <ConquestMembers rows={CONQUEST_PARTS.members} onOpenPlayer={fn()} className="max-w-sm" /> };
export const PhaseResult: Story = { args: { rows: [] }, render: () => <ConquestPhaseCard result={CONQUEST_PARTS.phase} className="max-w-sm" /> };
export const Final: Story = { args: { rows: [] }, render: () => <ConquestFinalCard final={CONQUEST_PARTS.final} title="This Conquest" onClaim={fn()} className="max-w-sm" /> };
export const FinalClaimed: Story = { args: { rows: [] }, render: () => <ConquestFinalCard final={{ ...CONQUEST_PARTS.final, claimed: true, toClaim: 0 }} title="The last Conquest" className="max-w-sm" /> };
