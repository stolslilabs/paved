import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";
import { TILES } from "../../mocks/scenes";
import { withCobbles } from "../../stories/with-cobbles";
import { pickSkin } from "../containers/cobble-types";
import { TilesScene } from "./tiles-scene";

/** The picks move in every story: a pick joins the batch and Discard empties it (the state's own batch is where it starts). */
function Stateful({ skins, onPick, onDiscard, ...args }: React.ComponentProps<typeof TilesScene>) {
  const [changes, setChanges] = useState(skins?.changes ?? {});
  useEffect(() => setChanges(skins?.changes ?? {}), [skins]);
  return (
    <TilesScene
      {...args}
      skins={skins ? { ...skins, changes } : skins}
      onPick={(plan, code) => {
        if (skins) setChanges((c) => pickSkin(skins.active, c, plan, code));
        onPick?.(plan, code);
      }}
      onDiscard={() => {
        setChanges({});
        onDiscard?.();
      }}
    />
  );
}

/**
 * Tiles (`/tiles`, COLLECTION-PAGE): the HUD's drawer, the selected tile on its pedestal, its skins, then the 19 tiles; the picks
 * saved together in one write. One story per state; the viewport is the toolbar's (VP).
 */
const meta = {
  title: "Scenes/Tiles",
  component: TilesScene,
  render: (args) => <Stateful {...args} />,
  args: { onPick: fn(), onSave: fn(), onDiscard: fn(), onOpenShop: fn(), onBack: fn(), onConnect: fn(), onRetry: fn(), onDismissRefusal: fn() },
  // The Cobbles at the header's top right.
  decorators: [withCobbles],
} satisfies Meta<typeof TilesScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Four Forest tiles owned, two wearing it; City corner (plan 7) shown: Default in use, Forest owned. */
export const Owned: Story = { args: TILES.owned };

/** Capital (plan 1), owned in no theme: Forest locked, its shop a tap away. */
export const Locked: Story = { args: TILES.locked };

/** Two picks changed: Save sends them in one write, Discard drops them. */
export const Changed: Story = { args: TILES.changed };

/** The write on its way. */
export const Saving: Story = { args: TILES.saving };

/** Saved. */
export const Saved: Story = { args: TILES.saved };

/** The save refused, the batch kept. */
export const Refused: Story = { args: TILES.refused };

/** No skin owned: every tile on Default. */
export const None: Story = { args: TILES.none };

/** The whole Forest set. */
export const AllForest: Story = { args: TILES.allForest };

/** A guest: Connect. */
export const Guest: Story = { args: TILES.guest };

/** The reads on their way. */
export const Loading: Story = { args: TILES.loading };

/** A failed read, with Retry. */
export const ReadError: Story = { args: TILES.error };
