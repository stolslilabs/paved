import type { Meta, StoryObj } from "@storybook/react-vite";
import { CAMPAIGNS, PlanType } from "@paved/game-core";
import { appRenders } from "../../mocks/assets";
import { CampaignCard, type CampaignCardProps } from "./campaign-card";

const PLAN_IDS = Object.values(PlanType);
const plansOf = (index: number) => [...new Set(CAMPAIGNS[index]!.levels.flatMap((l) => l.deck))].map((p) => PLAN_IDS.indexOf(p));
const OPEN_COUNTRY: CampaignCardProps = { id: 2, name: "Open Country", summary: CAMPAIGNS[1]!.summary, levels: 12, stars: 0, status: "open", plans: plansOf(1), renders: appRenders };
const TUTORIAL: Partial<CampaignCardProps> = { id: 1, name: "Tutorial", summary: CAMPAIGNS[0]!.summary, plans: plansOf(0) };
const DARK_FOREST: Partial<CampaignCardProps> = { id: 3, name: "Dark Forest", summary: CAMPAIGNS[2]!.summary, theme: 1, plans: plansOf(2) };

/**
 * A Story campaign's card (#592, #721; STORY-PAGE, after Play's raised mode cards): its build-time picture in its theme carved into a
 * raised card (no WebGL), its name and stars over the picture's foot (the painted star), its summary and a status line (its levels, the
 * campaign to finish first, Complete). A locked one is blurred under the painted lock; an unlocking one plays the unlock once.
 */
const meta = {
  title: "Containers/Campaign card",
  component: CampaignCard,
  args: OPEN_COUNTRY,
  decorators: [
    (Story) => (
      <div className="w-full max-w-md bg-secondary p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CampaignCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Open: its picture, its levels and stars. */
export const Open: Story = { args: { stars: 7 } };

/** Locked: the picture under a blur, the painted lock, and the campaign to finish first. */
export const Locked: Story = { args: { status: "locked" } };

/** Just unlocked (the first visit since): the lock opens and goes, the blur lifts, once. */
export const Unlocking: Story = { args: { status: "unlocking" } };

/** The same under reduced motion: open at once, no animation. */
export const UnlockingReduced: Story = { args: { status: "unlocking" }, parameters: { reducedMotion: "always" } };

/** Every level finished. */
export const Complete: Story = { args: { ...TUTORIAL, stars: 33, status: "complete" } };

/** The Tutorial's card: its puzzle picture (#721), a small board with one tile lifted off its slot. */
export const Tutorial: Story = { args: { ...TUTORIAL, stars: 12 } };

/** Dark Forest (#721, the Forest theme): a whole board in Forest, locked. */
export const DarkForest: Story = { args: { ...DARK_FOREST, status: "locked" } };

/** No picture in the build (an older manifest): the mosaic of its tiles. */
export const NoPicture: Story = { args: { stars: 4, renders: undefined } };
