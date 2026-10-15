import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";
import { THEME } from "../../mocks/scenes";
import { toggleSkin } from "../containers/cobble-types";
import { THEME_CODES } from "../containers/skin-grid";
import { ThemeScene } from "./theme-scene";

/** The switches move in every skins story: a toggle joins the batch and Discard empties it (the state's own batch is where it starts). */
function Stateful({ skins, onToggleSkin, onDiscardSkins, ...args }: React.ComponentProps<typeof ThemeScene>) {
  const [changes, setChanges] = useState(skins?.changes ?? {});
  useEffect(() => setChanges(skins?.changes ?? {}), [skins]);
  return (
    <ThemeScene
      {...args}
      skins={skins ? { ...skins, changes } : skins}
      onToggleSkin={(plan) => {
        if (skins) setChanges((c) => toggleSkin(skins.active, c, plan, THEME_CODES[skins.theme]));
        onToggleSkin?.(plan);
      }}
      onDiscardSkins={() => {
        setChanges({});
        onDiscardSkins?.();
      }}
    />
  );
}

/**
 * The theme (`/settings/theme`): Default and Forest to choose, Snow, Desert and Volcano coming soon, each a preview card;
 * with Cobbles (P-61), a theme's 19 tile skins to buy and switch on, saved in one write. One story per state; the viewport
 * is the toolbar's (VP).
 */
const meta = {
  title: "Scenes/Theme",
  component: ThemeScene,
  render: (args) => <Stateful {...args} />,
  args: { onSelect: fn(), onBack: fn(), onNavigate: fn(), onBrowse: fn(), onBuySkin: fn(), onToggleSkin: fn(), onSaveSkins: fn(), onDiscardSkins: fn(), onBuyCobbles: fn() },
} satisfies Meta<typeof ThemeScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Default (meadows) in use. */
export const DefaultSelected: Story = { args: THEME.defaultSelected };

/** Forest in use. */
export const ForestSelected: Story = { args: THEME.forestSelected };

/** P-61, Forest's skins: four owned, two active ("2 of 19 active"), the rest priced by rarity (50 to 100 Cobbles). */
export const Skins: Story = { args: THEME.skins };

/** Two switches changed: Save sends them in one write, Discard drops them. */
export const SkinsChanged: Story = { args: THEME.skinsChanged };

/** The write on its way. */
export const SkinsSaving: Story = { args: THEME.skinsSaving };

/** Saved. */
export const SkinsSaved: Story = { args: THEME.skinsSaved };

/** No Cobbles and nothing owned: Get Cobbles. */
export const NoCobbles: Story = { args: THEME.noCobbles };

/** 60 Cobbles: two skins can be bought, the others say how many more Cobbles they need. */
export const CantAfford: Story = { args: THEME.cantAfford };

/** A purchase on its way. */
export const Buying: Story = { args: THEME.buying };

/** The whole set: 19 of 19 active. */
export const AllActive: Story = { args: THEME.allActive };

/** Snow: not priced yet, coming soon. */
export const ComingSoon: Story = { args: THEME.comingSoon };

/** Forest withdrawn from sale with four skins owned: the owned ones stay and switch, the others are not for sale. */
export const OwnedUnpriced: Story = { args: THEME.ownedUnpriced };

/** WRAP360: the largest Cobble balance. */
export const SkinsStress: Story = { args: THEME.skinsStress };

/** P11b, a guest: the skins ask to Connect. */
export const SkinsGuest: Story = { args: { ...THEME.forestSelected, skinsStatus: { kind: "guest" } } };

/** P11b: the skins on their way from the chain. */
export const SkinsLoading: Story = { args: { ...THEME.forestSelected, skinsStatus: { kind: "loading" } } };

/** P11b: a failed read, with Retry. */
export const SkinsError: Story = { args: { ...THEME.forestSelected, skinsStatus: { kind: "error", message: "The node did not answer: Failed to fetch" } } };

/** P11b: a save refused by the chain (a skin in the batch is not owned), the batch kept to try again. */
export const SkinsRefused: Story = {
  args: { ...THEME.skinsChanged, skins: { ...THEME.skinsChanged.skins, refusal: "A skin in this change is not yours: buy it before switching it on. Nothing was saved." } },
};
