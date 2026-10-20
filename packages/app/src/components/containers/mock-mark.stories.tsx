import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MockMark, MockMarkProvider } from "./mock-mark";
import { TabPage } from "./tab-page";
import { TopBar } from "./top-bar";

/** The "Mock" mark (MOCK-FIRST, #622): a small pill beside a page's title while the mock serves part of the page's data. */
const meta = { title: "Containers/Mock mark", component: MockMark } satisfies Meta<typeof MockMark>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The mark alone. */
export const Mark: Story = {};

/** In a tab page's header, beside the title, with the balances' pill on the right. */
export const InTabPage: Story = {
  render: () => (
    <MockMarkProvider value>
      <TabPage tab="vault" title="Vault" onNavigate={fn()}>
        <p className="text-sm text-muted-foreground">The page's content.</p>
      </TabPage>
    </MockMarkProvider>
  ),
};

/** On the title's line of a full-screen flow's top bar (the purchase). */
export const InTopBar: Story = {
  render: () => (
    <MockMarkProvider value>
      <TopBar title="Challenge" onBack={fn()} />
    </MockMarkProvider>
  ),
};

/** A long tab-page title wraps; the mark stays on its last line. */
export const InTabPageLongTitle: Story = {
  render: () => (
    <MockMarkProvider value>
      <TabPage tab="vault" title="The Vault of the long winter" onNavigate={fn()}>
        <p className="text-sm text-muted-foreground">The page's content.</p>
      </TabPage>
    </MockMarkProvider>
  ),
};

/** No mark on a page the chain serves: the provider says false. */
export const Off: Story = {
  render: () => (
    <MockMarkProvider value={false}>
      <TabPage tab="ranks" title="Leaderboard" onNavigate={fn()}>
        <p className="text-sm text-muted-foreground">The page's content.</p>
      </TabPage>
    </MockMarkProvider>
  ),
};
