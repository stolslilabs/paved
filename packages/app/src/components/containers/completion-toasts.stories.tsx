import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CompletionKind } from "../../lib/quest-toasts";
import { QUESTS_TODAY_COMPLETED, QUESTS_TODAY_ONE_TO_GO } from "../../mocks/quests";
import { Button } from "../ui/button";
import { Toaster } from "../ui/sonner";
import { toastCompletion, useCompletionToasts, type CompletionToast } from "./completion-toasts";
import { questText } from "./quest-text";

/** Raises one completion toast at mount, and again on the button. */
function ToastDemo({ kind, entry }: { kind: CompletionKind; entry: CompletionToast }) {
  const [n, setN] = useState(0);
  useEffect(() => toastCompletion(kind, `${kind}:story:${n}`, entry), [kind, entry, n]);
  return (
    <div className="flex min-h-80 flex-col items-start gap-3 p-4">
      <Toaster />
      <Button size="sm" variant="outline" onClick={() => setN((x) => x + 1)}>
        Complete again
      </Button>
    </div>
  );
}

/**
 * The completion toasts (#595): raised app-wide (`routes/completion-host.tsx`) when the indexer's read shows a mission
 * completed, on any page, the board included; at the top, with the mission's icon, its title and its reward.
 */
const meta = {
  title: "Containers/CompletionToasts",
  component: ToastDemo,
  parameters: { layout: "fullscreen" },
  args: { kind: "quest", entry: { title: "Public Works", icon: "castle", cobbles: 10 } },
} satisfies Meta<typeof ToastDemo>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A quest of the day completed: its title, icon and Cobbles to claim. */
export const QuestCompleted: Story = {};

/** A quest without reward (a network without the ledger). */
export const QuestNoReward: Story = { args: { entry: { title: "Daily Run", icon: "flag-checkered" } } };

/** An achievement earned: its points and its Cobbles. */
export const AchievementEarned: Story = { args: { kind: "achievement", entry: { title: "Forester", icon: "tree", description: "+20 pts", cobbles: 20 } } };

/** A Tutorial step done (#977): its title, the next step's, and its Cobbles to claim. */
export const TutorialStepDone: Story = { args: { kind: "tutorial", entry: { title: "Builder", icon: "hammer", description: "Next: Challenger", cobbles: 10 } } };

/** The Tutorial's last step done (#977): no step after it. */
export const TutorialLastStep: Story = { args: { kind: "tutorial", entry: { title: "Rising", icon: "arrow-trend-up", description: "Every step done", cobbles: 50 } } };

function CompletingDemo() {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), 2_000);
    return () => clearTimeout(t);
  }, []);
  const quests = done ? QUESTS_TODAY_COMPLETED : QUESTS_TODAY_ONE_TO_GO;
  const tracked = quests.quests.map((q) => ({ id: q.questId, intervalId: q.intervalId, completed: q.completed }));
  useCompletionToasts("quest", tracked, ({ id }) => ({ ...questText(id), cobbles: 10 }), { scope: quests.day });
  return (
    <div className="flex min-h-80 flex-col items-start gap-3 p-4">
      <Toaster />
      <p className="text-sm text-muted-foreground">Public Works: {done ? "8 of 8" : "7 of 8"} roads and cities.</p>
      <Button size="sm" variant="outline" onClick={() => setDone((d) => !d)}>
        {done ? "Undo the structure" : "Score a structure"}
      </Button>
    </div>
  );
}

/** Public Works one structure short; two seconds in (or on the button) the read comes back at 8 of 8 and the toast shows, once: undo and score again, and it stays quiet. */
export const Completing: Story = { render: () => <CompletingDemo /> };
