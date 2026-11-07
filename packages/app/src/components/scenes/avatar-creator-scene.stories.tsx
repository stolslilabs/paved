import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { BalancesProvider } from "../containers/balances-context";
import { AVATAR_CREATOR } from "../../mocks/scenes";
import { AvatarCreatorScene } from "./avatar-creator-scene";

/**
 * The avatar editor (`/avatar`, #626 PR 2, AVATAR-LIVING; AVATAR-PAGE, the Paved UX Book's "avatar-editor"), from the Profile's Avatar:
 * the HUD's drawer docked at the left, the living avatar in its disc (no league), the categories as painted tabs, each one's options three a
 * row with their pill, the option tried on with Buy, and Randomise, Reset and Save at the foot. One story per state; the viewport is the
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
    onRetry: fn(),
    onBack: fn(),
    onClose: fn(),
    onPart: fn(),
  },
  // The shell's balances, the Cobbles at the header's end as the app shows them: the creator's own balance.
  decorators: [
    (Story, { args }) => (
      <BalancesProvider value={{ state: { status: "ready", usdc: 48_500_000n, paved: 0n, vpaved: 0n, cobbles: args.creator?.balance ?? 640 }, onAction: fn() }}>
        <Story />
      </BalancesProvider>
    ),
  ],
} satisfies Meta<typeof AvatarCreatorScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The saved avatar, Skin tone open: the five tones, all free. */
export const Saved: Story = { args: AVATAR_CREATOR.saved };
/** Headwear: one bought and four free (nothing under them), the others on sale (the Feathered cap for the winter). */
export const Headwear: Story = { args: AVATAR_CREATOR.headwear };
/** An option on sale tried on (the book's Viking helm's place): its rarity, its price, its season's end and Buy; Save waits for it. */
export const Priced: Story = { args: AVATAR_CREATOR.priced };
/** Accessory: one withdrawn from sale. */
export const Accessory: Story = { args: AVATAR_CREATOR.accessory };
export const Hair: Story = { args: AVATAR_CREATOR.hair };
export const Eyes: Story = { args: AVATAR_CREATOR.eyes };
export const Outfit: Story = { args: AVATAR_CREATOR.outfit };
export const Pauldrons: Story = { args: AVATAR_CREATOR.pauldrons };
/** Backdrop: the village free, the other scenes priced. */
export const Backdrop: Story = { args: AVATAR_CREATOR.backdrop };
/** A legendary item tried on: its rarity beside its name. */
export const Legendary: Story = { args: AVATAR_CREATOR.legendary };
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
/** The reads on their way. */
export const Loading: Story = { args: AVATAR_CREATOR.loading };
/** A failed read, with Retry. */
export const ReadError: Story = { args: AVATAR_CREATOR.error };
/** A network without the avatar contract. */
export const Unavailable: Story = { args: AVATAR_CREATOR.unavailable };
/** WRAP360: the largest Cobble balance. */
export const Stress: Story = { args: AVATAR_CREATOR.stress };
