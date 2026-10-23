import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SAVED_LOOK } from "../../mocks/avatar";
import { PROGRESS } from "../../mocks/players";
import { PROFILE } from "../../mocks/scenes";
import type { ProfileState } from "./profile-sheet";
import { ProfileSlot } from "./profile-context";
import { TabPage } from "./tab-page";

/** The avatar in a tab page, as the shell lays it out (#624): the top left of the header below `desktop`, the left of the navigation's header from it. A tap opens the sheet. */
function InPage() {
  return (
    <TabPage tab="vault" title="Vault">
      <div data-slot="card" className="h-40 rounded-xl border border-border bg-card" />
    </TabPage>
  );
}

const meta = { title: "Containers/ProfileSlot", component: ProfileSlot, render: () => <InPage /> } satisfies Meta<typeof ProfileSlot>;
export default meta;
type Story = StoryObj<typeof meta>;

const profile = (state: ProfileState, progress = PROGRESS.start, look: bigint | null = null) => ({
  profile: { state, progress, look, onConnect: fn(), onDisconnect: fn(), onCopy: fn(async () => {}), onEditAvatar: fn() },
});

export const Connected: Story = { parameters: profile(PROFILE.connected) };
/** The ring part way (#625), as it will be once the contracts define XP. */
export const PartWay: Story = { parameters: profile(PROFILE.connected, PROGRESS.partWay) };
/** The avatar the player saved (#626): its still at the top left, in the ring. */
export const SavedAvatar: Story = { parameters: profile(PROFILE.connected, PROGRESS.partWay, SAVED_LOOK) };
export const Guest: Story = { parameters: profile(PROFILE.guest) };
export const Loading: Story = { parameters: profile(PROFILE.loading) };
