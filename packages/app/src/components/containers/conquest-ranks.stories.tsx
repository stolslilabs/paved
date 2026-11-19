import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CONQUEST_PARTS } from "../../mocks/conquest";
import { ConquestFinalEnd, ConquestMembers, ConquestPhaseEnd, ConquestRanks, ConquestResultRow } from "./conquest-ranks";

/** The Conquest's lists and results: the allegiances by points, the allegiance's members, a phase over and the Conquest over. */
const meta = {
  title: "Containers/ConquestRanks",
  component: ConquestRanks,
  args: { label: "Allegiances by points", className: "max-w-sm" },
} satisfies Meta<typeof ConquestRanks>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ranking: Story = { args: { rows: CONQUEST_PARTS.ranking.rows } };
/** One phase's points alone. */
export const Phase: Story = { args: { rows: CONQUEST_PARTS.ranking.rows, by: "foundation" } };
export const Members: Story = { args: { rows: [] }, render: () => <ConquestMembers rows={CONQUEST_PARTS.members} onOpenPlayer={fn()} className="max-w-sm" /> };
export const MembersByKnowledge: Story = { args: { rows: [] }, render: () => <ConquestMembers rows={CONQUEST_PARTS.members} by="knowledge" onOpenPlayer={fn()} className="max-w-sm" /> };
export const PhaseOver: Story = { args: { rows: [] }, render: () => <div className="max-w-sm"><ConquestPhaseEnd result={CONQUEST_PARTS.phase} rest next="Next: Awakening, from day 8." /></div> };
/** A member short of days: the phase does not pay them. */
export const PhaseOverNotPaid: Story = { args: { rows: [] }, render: () => <div className="max-w-sm"><ConquestPhaseEnd result={{ ...CONQUEST_PARTS.phase, days: 1, eligible: false, cobbles: 0 }} rest={false} next="Next: Awakening, from day 8." /></div> };
export const ConquestOver: Story = { args: { rows: [] }, render: () => <div className="max-w-sm"><ConquestFinalEnd final={CONQUEST_PARTS.final} /></div> };
/** Past the podium: a plain shield, no crest. */
export const ConquestOverFifth: Story = { args: { rows: [] }, render: () => <div className="max-w-sm"><ConquestFinalEnd final={{ ...CONQUEST_PARTS.final, place: 5, crest: null }} last /></div> };
export const ResultRow: Story = { args: { rows: [] }, render: () => <div className="max-w-sm"><ConquestResultRow title="Foundation is over" place={2} of={6} waiting={100} guild={CONQUEST_PARTS.phase.guild} onOpen={fn()} /></div> };
