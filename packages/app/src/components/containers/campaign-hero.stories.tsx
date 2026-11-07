import type { Meta, StoryObj } from "@storybook/react-vite";
import { CAMPAIGNS, PlanType } from "@paved/game-core";
import { appRenders } from "../../mocks/assets";
import { CampaignHero, type CampaignHeroProps } from "./campaign-hero";

const PLAN_IDS = Object.values(PlanType);
const plansOf = (index: number) => [...new Set(CAMPAIGNS[index]!.levels.flatMap((l) => l.deck))].map((p) => PLAN_IDS.indexOf(p));
const OPEN_COUNTRY: CampaignHeroProps = { id: 2, name: "Open Country", summary: CAMPAIGNS[1]!.summary, levels: 12, stars: 0, status: "open", plans: plansOf(1), renders: appRenders };
const TUTORIAL: Partial<CampaignHeroProps> = { id: 1, name: "Tutorial", summary: CAMPAIGNS[0]!.summary, plans: plansOf(0) };
const DARK_FOREST: Partial<CampaignHeroProps> = { id: 3, name: "Dark Forest", summary: CAMPAIGNS[2]!.summary, theme: 1, plans: plansOf(2) };

/**
 * A Story campaign at the head of Story's view (#592, #721; STORY-PAGE, the owner's ask of 2026-11-07: no card): its build-time picture
 * in its theme (no WebGL) edge to edge, fading into the drawer's body by the end of its words; over it its name and stars (the painted
 * star), its summary and a status line (its levels, the campaign to finish first, Complete). A locked one is blurred under the painted
 * lock; an unlocking one plays the unlock once. Shown here at the drawer's width, on its body's colour.
 */
const meta = {
  title: "Containers/Campaign hero",
  component: CampaignHero,
  args: OPEN_COUNTRY,
  decorators: [
    (Story) => (
      <div className="w-full max-w-md bg-secondary pb-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CampaignHero>;
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

/** The Tutorial: its puzzle picture (#721), a small board with one tile lifted off its slot. */
export const Tutorial: Story = { args: { ...TUTORIAL, stars: 12 } };

/** Dark Forest (#721, the Forest theme): a whole board in Forest, locked. */
export const DarkForest: Story = { args: { ...DARK_FOREST, status: "locked" } };

/** No picture in the build (an older manifest): the mosaic of its tiles. */
export const NoPicture: Story = { args: { stars: 4, renders: undefined } };
