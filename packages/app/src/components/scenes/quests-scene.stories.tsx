import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { QUESTS_TODAY_COMPLETED, QUESTS_TODAY_ONE_TO_GO } from "../../mocks/quests";
import { QUESTS } from "../../mocks/scenes";
import { Button } from "../ui/button";
import { Toaster } from "../ui/sonner";
import { QuestsScene } from "./quests-scene";

/**
 * The quests (`/quests/:day?`): the day's rotating Daily set and the Weekly ones, each with a countdown, a toast when a
 * quest completes, and the day picker. One story per state; the viewport is the toolbar's (VP).
 */
const meta = { title: "Scenes/Quests", component: QuestsScene, args: { onDayChange: fn(), onTab: fn(), onConnect: fn(), onRetry: fn(), onNavigate: fn() } } satisfies Meta<typeof QuestsScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Today (Wednesday): Daily Run and the three of the rotation (offset 1), Daily Run done, and the week's three. Daily counts down to 00:00 UTC, Weekly to Monday 00:00 UTC. */
export const Today: Story = { args: QUESTS.today };

/** Yesterday, closed: the rotation's offset 0 (Small Works, Woodland Walk, Warm-Up Score), all seven dailies done; the weeklies are where they stood that day. No countdown on a closed day. */
export const AllComplete: Story = { args: QUESTS.allDone };

/** A past day the player did not play. */
export const NotPlayed: Story = { args: QUESTS.idle };

/** A day before the quests were defined: none live. */
export const NoQuest: Story = { args: QUESTS.none };

/** A weekly quest complete (Weekly Forester, 5 of 5). */
export const WeeklyDone: Story = { args: QUESTS.weeklyDone };

/** Four minutes before 00:00 UTC: the Daily countdown is amber. */
export const EndingSoon: Story = { args: QUESTS.endingSoon };

/** No wallet: Connect. */
export const Guest: Story = { args: QUESTS.guest };

/** The day's quests on their way. */
export const Loading: Story = { args: QUESTS.loading };

/** The indexer did not answer. */
export const Failed: Story = { args: QUESTS.error };

type SceneProps = React.ComponentProps<typeof QuestsScene>;

function CompletingScene(args: SceneProps) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), 2_000);
    return () => clearTimeout(t);
  }, []);
  return (
    <>
      <Toaster position="top-center" />
      <QuestsScene {...args} quests={done ? QUESTS_TODAY_COMPLETED : QUESTS_TODAY_ONE_TO_GO} />
      <div className="mt-4 flex gap-3">
        <Button size="sm" variant="outline" onClick={() => setDone((d) => !d)}>
          {done ? "Undo the structure" : "Score a structure"}
        </Button>
      </div>
    </>
  );
}

/** Public Works is one structure short; two seconds in (or on the button) the read comes back at 8 of 8 and the toast shows, once: undo and score again, and it stays quiet. */
export const Completing: Story = { args: QUESTS.today, render: (args) => <CompletingScene {...args} /> };
