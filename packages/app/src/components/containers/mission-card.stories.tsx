import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LONG_LABEL, LONG_SENTENCE, LONG_WORD } from "../../mocks/stress";
import { PHONE_320, PHONE_375 } from "../scenes/viewports";
import { MissionCard, type Mission } from "./mission-card";

/** A daily: no Cobbles of its own (its row's gifts pay): no claim, the medallion's own badge. */
const PUBLIC_WORKS: Mission = {
  key: "quest:6",
  kind: "daily",
  title: "Public Works",
  description: "Score roads and cities in a day: the middle of three rotating targets.",
  icon: "castle",
  state: "progress",
  progress: [{ unit: "roads and cities scored", count: 4, total: 8 }],
};
/** An achievement with its Cobbles: claimed from its medallion's badge. */
const SETTLER: Mission = {
  key: "achievement:3",
  kind: "lifetime",
  title: "Settler II",
  description: "Finish Challenge games: the second tier.",
  icon: "house-chimney",
  state: "claimable",
  progress: [{ unit: "Challenge games finished", count: 10, total: 10 }],
  reward: { cobbles: 20, claimed: false },
};
/** A Tutorial step with its Cobbles, open. */
const BUILDER: Mission = {
  key: "tutorial:1",
  kind: "tutorial",
  title: "Builder",
  description: "Place a tile in your village and save its layout.",
  icon: "hammer",
  state: "none",
  progress: [{ unit: "layouts saved", count: 0, total: 1 }],
  reward: { cobbles: 10, claimed: false },
  tutorial: { step: 1 },
};

/**
 * The selected mission at the top of the Missions page (#832; MISSIONS-PAGE, the owner's asks of 2026-11-04: no more text than that,
 * room for it on a small phone): its medallion, its kind, its title, its task and a counter, the text the card's whole width. A
 * mission with Cobbles of its own is claimed from the badge at its medallion's foot, its tooltip "+20" and the Cobble.
 */
const meta = { title: "Containers/MissionCard", component: MissionCard, args: { mission: PUBLIC_WORKS, onClaim: fn() } } satisfies Meta<typeof MissionCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A daily in progress: "4 / 8", no claim of its own. */
export const InProgress: Story = {};
/** A daily done: the medallion's check, its row's gift pays. */
export const DailyDone: Story = { args: { mission: { ...PUBLIC_WORKS, state: "done", progress: [{ unit: "roads and cities scored", count: 8, total: 8 }] } } };
/** An achievement done: its badge the lit gift in its gold halo, shaking now and then; a tap claims its 20 Cobbles. */
export const Claim: Story = { args: { mission: SETTLER } };
/** The claim on its way: the gift shaking fast. */
export const Claiming: Story = { args: { mission: { ...SETTLER, reward: { cobbles: 20, claimed: false, claiming: true } } } };
/** Claimed: the check. */
export const Claimed: Story = { args: { mission: { ...SETTLER, state: "done", reward: { cobbles: 20, claimed: true } } } };
/** No wallet to sign yet: the gift lit and still (the page's notice asks to connect). */
export const ReadOnly: Story = { args: { mission: SETTLER, canClaim: false } };
/** An achievement not done: its gift silvered, its tooltip saying what it holds. */
export const AchievementToDo: Story = {
  args: { mission: { ...SETTLER, key: "achievement:7", title: "Pilgrimage", description: "Score a wonder.", icon: "landmark-dome", state: "none", progress: [{ unit: "wonders scored", count: 0, total: 1 }], reward: { cobbles: 30, claimed: false } } },
};
/** A Tutorial step open: its gift silvered until the step is done. */
export const TutorialOpen: Story = { args: { mission: BUILDER } };
/** A Tutorial step locked: the lock. */
export const TutorialLocked: Story = {
  args: { mission: { ...BUILDER, key: "tutorial:5", title: "Treasure", description: "Open a chest.", icon: "treasure-chest", state: "locked", progress: [{ unit: "chests opened", count: 0, total: 1 }], tutorial: { step: 5 } } },
};

/** The text at 320 and 375 px: the title, the task and the counter take the card's width beside the medallion. */
export const Claim320: Story = { ...PHONE_320, args: { mission: SETTLER } };
export const InProgress320: Story = { ...PHONE_320 };
/** WRAP360's stress text: a long title and a long task each end in an ellipsis on their one line, the card keeps its height. */
const STRESS: Mission = { ...SETTLER, title: LONG_LABEL, description: `${LONG_WORD} ${LONG_SENTENCE}`, reward: { cobbles: 9_999, claimed: false } };
export const Stress320: Story = { ...PHONE_320, args: { mission: STRESS } };
export const Stress375: Story = { ...PHONE_375, args: { mission: STRESS } };
