import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";
import { MY_TILES } from "../../mocks/scenes";
import { pickSkin } from "../containers/cobble-types";
import { MyTilesScene } from "./my-tiles-scene";

/** The picks move in every story: a pick joins the batch and Discard empties it (the state's own batch is where it starts). */
function Stateful({ skins, onPick, onDiscard, ...args }: React.ComponentProps<typeof MyTilesScene>) {
  const [changes, setChanges] = useState(skins?.changes ?? {});
  useEffect(() => setChanges(skins?.changes ?? {}), [skins]);
  return (
    <MyTilesScene
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
 * My tiles (`/settings/tiles`): each of the 19 tiles with the skins owned as one choice, saved together in one write. One
 * story per state; the viewport is the toolbar's (VP).
 */
const meta = {
  title: "Scenes/MyTiles",
  component: MyTilesScene,
  render: (args) => <Stateful {...args} />,
  args: { onPick: fn(), onSave: fn(), onDiscard: fn(), onOpenShop: fn(), onBack: fn(), onNavigate: fn(), onConnect: fn(), onRetry: fn(), onDismissRefusal: fn() },
} satisfies Meta<typeof MyTilesScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Four Forest tiles owned, two wearing it. */
export const Owned: Story = { args: MY_TILES.owned };

/** Two picks changed: Save sends them in one write, Discard drops them. */
export const Changed: Story = { args: MY_TILES.changed };

/** The write on its way. */
export const Saving: Story = { args: MY_TILES.saving };

/** Saved. */
export const Saved: Story = { args: MY_TILES.saved };

/** The save refused, the batch kept. */
export const Refused: Story = { args: MY_TILES.refused };

/** No skin owned: the shop to open. */
export const None: Story = { args: MY_TILES.none };

/** The whole Forest set. */
export const AllForest: Story = { args: MY_TILES.allForest };

/** A guest: Connect. */
export const Guest: Story = { args: MY_TILES.guest };

/** The reads on their way. */
export const Loading: Story = { args: MY_TILES.loading };

/** A failed read, with Retry. */
export const ReadError: Story = { args: MY_TILES.error };
