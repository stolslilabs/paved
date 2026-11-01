import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { AVATAR_CREATOR } from "../../mocks/scenes";
import { AvatarCreatorScene } from "./avatar-creator-scene";

/**
 * The avatar creator (`/avatar`, #626 PR 2, AVATAR-LIVING), from Edit avatar in the profile sheet: the living bust, the traits
 * as tabs, each trait's options as swatches with their Cobble price, Buy, Randomise and Save. One story per state; the viewport is
 * the toolbar's (VP).
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

/** The saved avatar, Skin open: the five tones, all free. */
export const Saved: Story = { args: AVATAR_CREATOR.saved };
/** Headwear: one bought (Owned), four free, one on sale for the winter. */
export const Headwear: Story = { args: AVATAR_CREATOR.headwear };
/** A priced option tried on: its price, its season's end and Buy; Save waits for it. */
export const Priced: Story = { args: AVATAR_CREATOR.priced };
/** Accessory: one withdrawn from sale. */
export const Accessory: Story = { args: AVATAR_CREATOR.accessory };
export const Hair: Story = { args: AVATAR_CREATOR.hair };
export const Eyes: Story = { args: AVATAR_CREATOR.eyes };
export const Outfit: Story = { args: AVATAR_CREATOR.outfit };
export const Pauldrons: Story = { args: AVATAR_CREATOR.pauldrons };
export const HairStyle: Story = { args: AVATAR_CREATOR.hairStyle };
export const Beard: Story = { args: AVATAR_CREATOR.beard };
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
/** No avatar saved yet: the king. */
export const None: Story = { args: AVATAR_CREATOR.none };
/** Four traits in use: four tabs. */
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
