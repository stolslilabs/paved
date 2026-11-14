import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TOURNAMENT_END } from "../../mocks/tournament";
import { PHONE_320 } from "../scenes/viewports";
import { TournamentEnd } from "./tournament-end";

/** A Tournament game's end (the weekly individual event): the score against the opponent's, the verdict, the Cobbles it secures. */
const meta = {
  title: "Containers/TournamentEnd",
  component: TournamentEnd,
  args: { onClose: fn(), onTournament: fn(), instant: true },
} satisfies Meta<typeof TournamentEnd>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The result still read: the rows wait. */
export const Reading: Story = { args: TOURNAMENT_END.reading };
/** The opponent's game is over and beaten: through before midnight. */
export const Through: Story = { args: TOURNAMENT_END.through };
export const Out: Story = { args: TOURNAMENT_END.out };
/** The opponent has not played yet: their turn. */
export const Waiting: Story = { args: TOURNAMENT_END.waiting };
/** The opponent's game is still open: ahead, or behind. */
export const Ahead: Story = { args: TOURNAMENT_END.ahead };
export const Behind: Story = { args: TOURNAMENT_END.behind };
/** Nobody opposite: through by playing. */
export const Walkover: Story = { args: TOURNAMENT_END.walkover };
/** The day is over. */
export const Won: Story = { args: TOURNAMENT_END.won };
export const Lost: Story = { args: TOURNAMENT_END.lost };
/** The final won. */
export const Champion: Story = { args: TOURNAMENT_END.champion };
/** A name of the widest letters wraps inside the carved card; at 320. */
export const LongName320: Story = { args: TOURNAMENT_END.longName, ...PHONE_320 };
