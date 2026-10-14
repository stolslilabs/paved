import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { NumberTicker } from "../src/components/elements/number-ticker";
import { AnimatedList, AnimatedListItem } from "../src/components/ui/animated-list";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "../src/components/ui/carousel";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "../src/components/ui/dialog";
import { Toaster, toast } from "../src/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../src/components/ui/tabs";

type Reduced = "never" | "always";
/** The app's providers in miniature, with reduced motion forced off or on as the stories do. */
const wrap = (ui: ReactNode, reducedMotion: Reduced = "never") => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reducedMotion}>{ui}</MotionConfig>
  </LazyMotion>
);

describe("Tabs highlight (motion-primitives AnimatedBackground)", () => {
  const Demo = () => (
    <Tabs defaultValue="a">
      <TabsList>
        <TabsTrigger value="a">A</TabsTrigger>
        <TabsTrigger value="b">B</TabsTrigger>
      </TabsList>
      <TabsContent value="a">panel a</TabsContent>
      <TabsContent value="b">panel b</TabsContent>
    </Tabs>
  );

  it("draws the highlight inside the active trigger and moves it with the selection", async () => {
    const user = userEvent.setup();
    render(wrap(<Demo />));
    expect(within(screen.getByRole("tab", { name: "A" })).getByText("A").parentElement?.querySelector('[data-slot="tabs-indicator"]')).not.toBeNull();
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(document.querySelectorAll('[data-slot="tabs-indicator"]')).toHaveLength(1);
    expect(screen.getByRole("tab", { name: "B" }).querySelector('[data-slot="tabs-indicator"]')).not.toBeNull();
    expect(screen.getByRole("tab", { name: "B" })).toHaveAccessibleName("B");
  });

  it("gives two Tabs on one page their own highlight", () => {
    render(wrap(<><Demo /><Demo /></>));
    const ids = new Set([...document.querySelectorAll('[role="tablist"]')].map((list) => list.closest('[data-slot="tabs"]')));
    expect(ids.size).toBe(2);
    expect(document.querySelectorAll('[data-slot="tabs-indicator"]')).toHaveLength(2);
  });
});

describe("Dialog enter and exit (motion-primitives Dialog)", () => {
  const Demo = () => (
    <Dialog>
      <DialogTrigger asChild><button>Open</button></DialogTrigger>
      <DialogContent>
        <DialogTitle>Give up?</DialogTitle>
      </DialogContent>
    </Dialog>
  );

  for (const reduced of ["never", "always"] as const) {
    it(`opens, then leaves the DOM after its exit, with reduced motion ${reduced === "always" ? "on" : "off"}`, async () => {
      const user = userEvent.setup();
      render(wrap(<Demo />, reduced));
      await user.click(screen.getByRole("button", { name: "Open" }));
      expect(await screen.findByRole("dialog", { name: "Give up?" })).toBeInTheDocument();
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 3000 });
      expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
    });
  }
});

describe("NumberTicker (Magic UI)", () => {
  it("counts from the start value to the value", async () => {
    render(wrap(<NumberTicker value={1240} />));
    const ticker = document.querySelector('[data-slot="number-ticker"]') as HTMLElement;
    expect(ticker).toHaveTextContent("0");
    await waitFor(() => expect(ticker).toHaveTextContent("1,240"), { timeout: 5000 });
  });

  it("writes the value at once under reduced motion, and follows a change", async () => {
    function Score() {
      const [score, setScore] = useState(96);
      return (
        <>
          <NumberTicker value={score} decimalPlaces={2} />
          <button onClick={() => setScore(104.5)}>Score</button>
        </>
      );
    }
    const user = userEvent.setup();
    render(wrap(<Score />, "always"));
    const ticker = document.querySelector('[data-slot="number-ticker"]') as HTMLElement;
    await waitFor(() => expect(ticker).toHaveTextContent("96.00"));
    await user.click(screen.getByRole("button", { name: "Score" }));
    // No frames needed: the text is written in the effect.
    expect(ticker).toHaveTextContent("104.50");
  });
});

describe("AnimatedList (Magic UI)", () => {
  function Rows({ initial }: { initial: string[] }) {
    const [rows, setRows] = useState(initial);
    return (
      <>
        <AnimatedList aria-label="Closings">
          {rows.map((r) => (
            <AnimatedListItem key={r}>{r}</AnimatedListItem>
          ))}
        </AnimatedList>
        <button onClick={() => setRows((rs) => ["new", ...rs])}>Add</button>
        <button onClick={() => setRows((rs) => rs.slice(1))}>Remove</button>
      </>
    );
  }

  for (const reduced of ["never", "always"] as const) {
    it(`adds a row and removes one after its exit, with reduced motion ${reduced === "always" ? "on" : "off"}`, async () => {
      const user = userEvent.setup();
      render(wrap(<Rows initial={["alice", "bob"]} />, reduced));
      const list = screen.getByRole("list", { name: "Closings" });
      expect(within(list).getAllByRole("listitem")).toHaveLength(2);
      await user.click(screen.getByRole("button", { name: "Add" }));
      expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["new", "alice", "bob"]);
      await user.click(screen.getByRole("button", { name: "Remove" }));
      await waitFor(() => expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["alice", "bob"]), { timeout: 3000 });
    });
  }
});

describe("Carousel (shadcn/ui on Embla)", () => {
  function Demo({ onApi }: { onApi: (api: CarouselApi) => void }) {
    return (
      <Carousel aria-label="Modes" setApi={onApi}>
        <CarouselContent>
          {["Daily", "Training", "Tutorial"].map((mode, i) => (
            <CarouselItem key={mode} aria-label={`${i + 1} of 3`}>{mode}</CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    );
  }

  it("is a named region of slides with previous and next buttons", async () => {
    let api: CarouselApi;
    render(wrap(<Demo onApi={(a) => (api = a)} />));
    const region = screen.getByRole("region", { name: "Modes" });
    expect(region).toHaveAttribute("aria-roledescription", "carousel");
    expect(within(region).getAllByRole("group")).toHaveLength(3);
    expect(within(region).getAllByRole("group")[0]).toHaveAttribute("aria-roledescription", "slide");
    await waitFor(() => expect(api).toBeDefined());
    expect(screen.getByRole("button", { name: "Previous slide" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next slide" })).toBeInTheDocument();
  });

  for (const reduced of ["never", "always"] as const) {
    it(`scrolls with the arrow keys, jumping under reduced motion (${reduced})`, async () => {
      let api: CarouselApi;
      render(wrap(<Demo onApi={(a) => (api = a)} />, reduced));
      await waitFor(() => expect(api).toBeDefined());
      const next = vi.spyOn(api!, "scrollNext");
      const prev = vi.spyOn(api!, "scrollPrev");
      const region = screen.getByRole("region", { name: "Modes" });
      region.tabIndex = 0;
      act(() => region.focus());
      const user = userEvent.setup();
      await user.keyboard("{ArrowRight}");
      await user.keyboard("{ArrowLeft}");
      expect(next).toHaveBeenCalledWith(reduced === "always");
      expect(prev).toHaveBeenCalledWith(reduced === "always");
    });
  }

  it("disables a button that cannot scroll and keeps it out of the Tab order", async () => {
    let api: CarouselApi;
    render(wrap(<Demo onApi={(a) => (api = a)} />));
    await waitFor(() => expect(api).toBeDefined());
    // jsdom measures nothing, so Embla sees one snap: neither way can scroll.
    expect(screen.getByRole("button", { name: "Previous slide" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next slide" })).toBeDisabled();
  });
});

describe("Toaster (Sonner)", () => {
  it("cuts its transitions when MotionConfig asks for reduced motion", async () => {
    const { rerender } = render(wrap(<Toaster />, "never"));
    act(() => void toast("Tile placed!"));
    const toaster = () => document.querySelector("[data-sonner-toaster]");
    await waitFor(() => expect(toaster()).not.toBeNull());
    expect(toaster()).not.toHaveClass("toaster-reduced-motion");
    rerender(wrap(<Toaster />, "always"));
    await waitFor(() => expect(toaster()).toHaveClass("toaster-reduced-motion"));
  });
});
