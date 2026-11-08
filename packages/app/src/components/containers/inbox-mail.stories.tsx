import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { INBOX_MAIL, PRIZE_MAIL } from "../../mocks/puzzle";
import { MailSection, PrizeMail } from "./inbox-mail";

/**
 * The Inbox's Mail (PUZZLE-MODE, the owner's approved mockups of 2026-11-08): the system's mail at the top of the chat's Inbox tab, a
 * Puzzle prize's per day the player finished first, derived on the client from the chain's state (no server sends it). Each row its
 * gift and its bubble ("Sat, Nov 7 · 250 Cobbles"); Claim all its one primary button. A prize's mail: the gift to tap (it shakes, opens,
 * the Cobbles burst out), the day's final first ten, the bin (a waiting gift is claimed first). On the mock community.
 */
const meta = {
  title: "Containers/InboxMail",
  component: MailSection,
  parameters: { layout: "padded" },
  args: { ...INBOX_MAIL.one, onClaimAll: fn(), onOpen: fn() },
  decorators: [(Story) => <div className="mx-auto max-w-xl">{Story()}</div>],
} satisfies Meta<typeof MailSection>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One prize waiting: its gift, Claim all. */
export const OnePrize: Story = {};
/** Two prizes waiting and one claimed under them: Claim all takes both. */
export const Stacked: Story = { args: INBOX_MAIL.stacked };
/** Claim all on its way. */
export const ClaimingAll: Story = { args: INBOX_MAIL.claiming };
/** A claim refused, its reason under the rows. */
export const ClaimRefused: Story = { args: INBOX_MAIL.refused };

type PrizeStory = StoryObj<typeof PrizeMail>;
const prize = (state: keyof typeof PRIZE_MAIL): PrizeStory => ({
  render: (args) => <PrizeMail {...args} />,
  args: { ...PRIZE_MAIL[state], onClaim: fn(), onDelete: fn(), onBack: fn(), onOpenPlayer: fn() },
});
/** A prize's mail, its gift waiting: "Puzzle of <day>: you won!", the gift to tap, the day's first ten (the viewer first, in gold). */
export const PrizeWaiting: PrizeStory = prize("waiting");
/** The gift tapped, its claim on its way. */
export const PrizeClaiming: PrizeStory = prize("claiming");
/** Claimed: the gift open, the Cobbles in the balance. */
export const PrizeClaimed: PrizeStory = prize("claimed");
/** The claim refused: the reason, the gift still to tap. */
export const PrizeRefused: PrizeStory = prize("refused");
