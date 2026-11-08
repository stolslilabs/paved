import { useState, type CSSProperties, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { UiIcon } from "../elements/ui-icon";
import type { UiIconName } from "../elements/ui-art";
import { VaultArtImage } from "../elements/vault-art-image";
import { Button } from "../ui/button";
import { Tabs, TabsContent } from "../ui/tabs";
import { FooterTab, FooterTabsList } from "./footer-tabs";

/** The drawer's foot as `DrawerFooter` draws it (`hud-drawer.tsx`): the card's charcoal, its near-black line along its top. */
const FOOT: CSSProperties = { backgroundColor: "var(--card)", boxShadow: "0 -1px 0 var(--hud-outline)" };

type Painted = UiIconName;
interface Tab {
  id: string;
  label: string;
  art: ReactNode;
  badge?: number;
  soon?: boolean;
}

const art = (name: Painted) => <UiIcon name={name} px={36} className="drawer-icon size-9" />;

/**
 * A drawer's body and foot (a phone's width): the tabs' panels in the body, the list at the foot, one `Tabs` root around both as a page
 * draws them (there the foot is `DrawerFooter`'s portal).
 */
function Sheet({ tabs, disabled, action }: { tabs: readonly Tab[]; disabled?: boolean; action?: ReactNode }) {
  const [tab, setTab] = useState(tabs[0]!.id);
  return (
    <Tabs value={tab} onValueChange={setTab} className="flex h-[28rem] w-72 max-w-full flex-col gap-0 bg-secondary">
      <div className="flex min-h-0 flex-1 flex-col p-4">
        {tabs.map((t) => (
          <TabsContent key={t.id} value={t.id} className="drawer-carved grid place-items-center rounded-xl text-muted-foreground">
            {t.label}
          </TabsContent>
        ))}
      </div>
      <div style={FOOT} className="flex flex-col">
        {action}
        <FooterTabsList aria-label="Sheet">
          {tabs.map((t) => (
            <FooterTab key={t.id} value={t.id} label={t.label} art={t.art} badge={t.badge} soon={t.soon} disabled={disabled} />
          ))}
        </FooterTabsList>
      </div>
    </Tabs>
  );
}

const meta = {
  title: "Containers/FooterTabs",
  component: Sheet,
  parameters: { layout: "centered" },
  args: { tabs: [] },
} satisfies Meta<typeof Sheet>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Two tabs (the Vault's, VAULT-PAGE): the current one lit, the gold bar over it; the arrow keys move between them. */
export const TwoTabs: Story = {
  args: {
    tabs: [
      { id: "deposit", label: "Deposit", art: <VaultArtImage name="deposit" px={36} className="drawer-icon size-9" /> },
      { id: "withdraw", label: "Withdraw", art: <VaultArtImage name="withdraw" px={36} className="drawer-icon size-9" /> },
    ],
  },
};

/** Three tabs (the Shop's today, as a footer would draw them). */
export const ThreeTabs: Story = {
  args: {
    tabs: [
      { id: "tiles", label: "Tiles", art: art("collection") },
      { id: "cobbles", label: "Cobbles", art: art("deck") },
      { id: "themes", label: "Themes", art: art("theme-forest") },
    ],
  },
};

/** Four tabs with counts waiting (the Guild's today): the dock's red square at the icon's top right, read out with the word. */
export const Badges: Story = {
  args: {
    tabs: [
      { id: "announcements", label: "News", art: art("letter"), badge: 3 },
      { id: "members", label: "Members", art: art("members") },
      { id: "requests", label: "Requests", art: art("invite-player"), badge: 120 },
      { id: "log", label: "Log", art: art("missions") },
    ],
  },
};

/** A tab not in the game yet: in its place, disabled, a carved "Soon" where a count would be (a count waiting on it is not shown). */
export const Soon: Story = {
  args: {
    tabs: [
      { id: "players", label: "Players", art: art("user") },
      { id: "guilds", label: "Allegiances", art: art("guild") },
      { id: "friends", label: "Friends", art: art("friends"), badge: 5, soon: true },
    ],
  },
};

/** A write on its way: the tabs keep their place, dimmed, and do not move. */
export const Disabled: Story = { args: { ...TwoTabs.args, disabled: true } };

/** The page's action over the tabs in the same footer (the Vault's gold button), on the body's charcoal: the current tab hangs from it. */
export const WithAction: Story = {
  args: {
    ...TwoTabs.args,
    action: (
      <div className="flex min-h-16 items-center justify-end bg-secondary px-4 py-2">
        <Button size="lg">Deposit</Button>
      </div>
    ),
  },
};

/** WRAP360: long words wrap under their icon rather than spill into the next tab. */
export const Stress: Story = {
  args: {
    tabs: [
      { id: "a", label: "Announcements and news", art: art("letter"), badge: 7 },
      { id: "b", label: "Members", art: art("members") },
      { id: "c", label: "Requestsrequestsrequests", art: art("invite-player") },
    ],
  },
};
