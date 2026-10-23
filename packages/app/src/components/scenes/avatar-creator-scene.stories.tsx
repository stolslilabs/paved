import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { AVATAR_CREATOR } from "../../mocks/scenes";
import { AvatarCreatorScene } from "./avatar-creator-scene";

/**
 * The avatar creator (`/avatar`, #626 PR 2), from Edit avatar in the profile sheet: the turning head, the parts as tabs, each
 * part's variants as swatches with their Cobble price, Buy, Randomise and Save. One story per state; the viewport is the
 * toolbar's (VP).
 */
const meta = {
  title: "Scenes/AvatarCreator",
  component: AvatarCreatorScene,
  args: {
    onPick: fn(),
    onBuy: fn(),
    onSave: fn(),
    onRandomise: fn(),
    onReset: fn(),
    onDismissRefusal: fn(),
    onBuyCobbles: fn(),
    onConnect: fn(),
    onRetry: fn(),
    onBack: fn(),
  },
} satisfies Meta<typeof AvatarCreatorScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The saved avatar, Skin tone open: four free tones, the others priced. */
export const Saved: Story = { args: AVATAR_CREATOR.saved };
/** Headwear: two bought (Owned), four free, the others priced. */
export const Headwear: Story = { args: AVATAR_CREATOR.headwear };
/** A priced variant tried on: its price and Buy; Save waits for it. */
export const Priced: Story = { args: AVATAR_CREATOR.priced };
/** Background: a bought one, two seasonal (with their end). */
export const Background: Story = { args: AVATAR_CREATOR.background };
/** Beard: one withdrawn from sale. */
export const Beard: Story = { args: AVATAR_CREATOR.beard };
export const Eyes: Story = { args: AVATAR_CREATOR.eyes };
export const Eyebrows: Story = { args: AVATAR_CREATOR.eyebrows };
export const Mouth: Story = { args: AVATAR_CREATOR.mouth };
export const HairColour: Story = { args: AVATAR_CREATOR.hairColour };
export const Hair: Story = { args: AVATAR_CREATOR.hair };
export const Accessory: Story = { args: AVATAR_CREATOR.accessory };
/** A free change not saved yet: Save. */
export const Changed: Story = { args: AVATAR_CREATOR.changed };
/** A purchase on its way. */
export const Buying: Story = { args: AVATAR_CREATOR.buying };
/** Too few Cobbles: Get Cobbles. */
export const Short: Story = { args: AVATAR_CREATOR.short };
/** The save on its way. */
export const Saving: Story = { args: AVATAR_CREATOR.saving };
/** Just saved. */
export const SavedNow: Story = { args: AVATAR_CREATOR.savedNow };
/** A purchase refused. */
export const Refused: Story = { args: AVATAR_CREATOR.refused };
/** No avatar saved yet: the default one. */
export const None: Story = { args: AVATAR_CREATOR.none };
/** Four parts in use: four tabs. */
export const FewParts: Story = { args: AVATAR_CREATOR.fewParts };
/** A guest: Connect. */
export const Guest: Story = { args: AVATAR_CREATOR.guest };
/** The reads on their way. */
export const Loading: Story = { args: AVATAR_CREATOR.loading };
/** A failed read, with Retry. */
export const ReadError: Story = { args: AVATAR_CREATOR.error };
/** A network without the avatar contract. */
export const Unavailable: Story = { args: AVATAR_CREATOR.unavailable };
/** WRAP360: the largest Cobble balance. */
export const Stress: Story = { args: AVATAR_CREATOR.stress };
