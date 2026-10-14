import type { Meta, StoryObj } from "@storybook/react-vite";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { useState, type ReactNode } from "react";

const meta = { title: "Foundations/Motion", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const SPRING = { type: "spring", stiffness: 500, damping: 36 } as const;

/**
 * Each demo twice: reduced motion off (`never`) and on (`always`). With it on, Motion keeps the opacity change and
 * drops the movement and scale (section 3.2: one switch, `MotionConfig reducedMotion`).
 */
function Pair({ title, note, children }: { title: string; note: string; children: () => ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-prose text-sm text-muted-foreground">{note}</p>
      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
        {(
          [
            ["Reduced motion: off", "never"],
            ["Reduced motion: on", "always"],
          ] as const
        ).map(([label, mode]) => (
          <MotionConfig key={mode} reducedMotion={mode}>
            <div className="flex min-h-40 flex-col gap-3 overflow-hidden rounded-md border border-border bg-card p-4" data-reduced={mode}>
              <span className="text-xs text-muted-foreground">{label}</span>
              {/* One group per half: the two tab indicators share a layoutId and must not see each other. */}
              <LayoutGroup id={mode}>{children()}</LayoutGroup>
            </div>
          </MotionConfig>
        ))}
      </div>
    </section>
  );
}

function PressButton() {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      whileHover={{ scale: 1.03 }}
      transition={SPRING}
      className="self-start rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      Place tile
    </motion.button>
  );
}

const TABS = ["Home", "Play", "Quests"] as const;

/** The shared `layoutId` of the sliding indicator under the active tab (section 6.2). */
function Tabs() {
  const [active, setActive] = useState<string>(TABS[0]);
  return (
    <div role="tablist" aria-label="Demo tabs" className="flex gap-1">
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={active === tab}
          onClick={() => setActive(tab)}
          className={`relative px-4 py-2 text-sm ${active === tab ? "text-primary" : "text-muted-foreground"}`}
        >
          {tab}
          {active === tab && (
            <motion.span layoutId="indicator" transition={SPRING} className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
          )}
        </button>
      ))}
    </div>
  );
}

/** A bottom sheet that enters and leaves with `AnimatePresence`. */
function Sheet() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative h-44">
      <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-md border border-border px-3 py-2 text-sm">
        {open ? "Close sheet" : "Open sheet"}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Demo sheet"
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="absolute inset-x-0 bottom-0 rounded-t-xl border border-border bg-popover p-4 text-sm text-popover-foreground"
          >
            A bottom sheet on mobile; a centred dialog from the tablet breakpoint.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A toast that slides in, then out. */
function Toast() {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative h-44">
      <button type="button" onClick={() => setShown((s) => !s)} className="rounded-md border border-border px-3 py-2 text-sm">
        {shown ? "Dismiss toast" : "Show toast"}
      </button>
      <AnimatePresence>
        {shown && (
          <motion.div
            role="status"
            initial={{ x: 48, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 48, opacity: 0 }}
            transition={SPRING}
            className="absolute right-0 bottom-0 rounded-md border border-border bg-popover px-4 py-3 text-sm text-popover-foreground"
          >
            Tile placed
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const ButtonPress: Story = {
  name: "Button press",
  render: () => (
    <div className="p-4 text-foreground">
      <Pair title="Button press" note="whileTap scales to 0.94, whileHover to 1.03, on a spring. Press and hold the button.">
        {() => <PressButton />}
      </Pair>
    </div>
  ),
};

export const TabIndicator: Story = {
  name: "Tab indicator",
  render: () => (
    <div className="p-4 text-foreground">
      <Pair title="Tab indicator" note="One shared layoutId: the underline slides from tab to tab. Reduced motion jumps it.">
        {() => <Tabs />}
      </Pair>
    </div>
  ),
};

export const SheetStory: Story = {
  name: "Sheet",
  render: () => (
    <div className="p-4 text-foreground">
      <Pair title="Sheet" note="Enters from the bottom edge and leaves the same way; reduced motion only fades.">
        {() => <Sheet />}
      </Pair>
    </div>
  ),
};

export const ToastStory: Story = {
  name: "Toast",
  render: () => (
    <div className="p-4 text-foreground">
      <Pair title="Toast" note="Slides in from the right and out again; reduced motion only fades.">
        {() => <Toast />}
      </Pair>
    </div>
  ),
};
