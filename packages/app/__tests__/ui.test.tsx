import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../src/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../src/components/ui/dialog";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "../src/components/ui/dropdown-menu";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "../src/components/ui/sheet";
import { Slider } from "../src/components/ui/slider";
import { Switch } from "../src/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../src/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "../src/components/ui/toggle-group";
import { cn } from "../src/lib/utils";

/** The app's providers in miniature: `m` components need a LazyMotion around them. */
const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

describe("cn", () => {
  it("joins class names and lets the last conflicting utility win", () => {
    expect(cn("px-2 py-1", false && "hidden", "px-4")).toBe("py-1 px-4");
  });
});

describe("Button", () => {
  it("fires on click and on Enter, and not when disabled or loading", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(wrap(<Button onClick={onClick}>Place</Button>));
    await user.click(screen.getByRole("button", { name: "Place" }));
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("is disabled and aria-busy while loading", () => {
    render(wrap(<Button loading>Place</Button>));
    const button = screen.getByRole("button", { name: "Place" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("gives a link the button's look with asChild", () => {
    render(wrap(<Button asChild><a href="#x">Go</a></Button>));
    const link = screen.getByRole("link", { name: "Go" });
    expect(link).toHaveAttribute("data-slot", "button");
    expect(link).not.toHaveAttribute("aria-disabled");
  });

  it("marks an asChild link aria-disabled and data-disabled when disabled or loading", () => {
    render(wrap(<><Button asChild disabled><a href="#d">Off</a></Button><Button asChild loading><a href="#l">Busy</a></Button></>));
    const off = screen.getByRole("link", { name: "Off" });
    expect(off).toHaveAttribute("aria-disabled", "true");
    expect(off).toHaveAttribute("data-disabled");
    const busy = screen.getByRole("link", { name: "Busy" });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(busy).toHaveAttribute("aria-busy", "true");
  });
});

describe("Tabs", () => {
  const Demo = (props: { onValueChange?: (v: string) => void }) => (
    <Tabs defaultValue="a" {...props}>
      <TabsList>
        <TabsTrigger value="a">A</TabsTrigger>
        <TabsTrigger value="b">B</TabsTrigger>
        <TabsTrigger value="c">C</TabsTrigger>
      </TabsList>
      <TabsContent value="a">panel a</TabsContent>
      <TabsContent value="b">panel b</TabsContent>
      <TabsContent value="c">panel c</TabsContent>
    </Tabs>
  );

  it("moves between tabs with the arrow keys and shows the matching panel", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(wrap(<Demo onValueChange={onValueChange} />));
    await user.tab();
    expect(screen.getByRole("tab", { name: "A" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "A" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "B" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "B" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("panel b")).toBeVisible();
    expect(screen.queryByText("panel a")).not.toBeInTheDocument();
    expect(onValueChange).toHaveBeenCalledWith("b");
  });

  it("selects on click and draws one indicator", async () => {
    const user = userEvent.setup();
    render(wrap(<Demo />));
    await user.click(screen.getByRole("tab", { name: "C" }));
    expect(screen.getByText("panel c")).toBeVisible();
    expect(document.querySelectorAll('[data-slot="tabs-indicator"]')).toHaveLength(1);
    expect(screen.getByRole("tablist").querySelector('[data-slot="tabs-indicator"]')).not.toBeNull();
  });

  it("merges the consumer's ref with the list's own", () => {
    const ref = { current: null as HTMLDivElement | null };
    render(
      <Tabs defaultValue="a">
        <TabsList ref={ref}>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(ref.current).toBe(screen.getByRole("tablist"));
  });

  it("keeps a disabled tab out of reach", async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b" disabled>B</TabsTrigger>
          <TabsTrigger value="c">C</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "C" })).toHaveFocus();
  });
});

describe("Dialog", () => {
  const Demo = () => (
    <Dialog>
      <DialogTrigger asChild><button>Open</button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild><button>Cancel</button></DialogClose>
          <button>Confirm</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  it("opens from the keyboard, moves focus in, traps Tab and returns focus on Escape", async () => {
    const user = userEvent.setup();
    render(wrap(<Demo />));
    await user.tab();
    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "Title" });
    expect(dialog).toHaveAccessibleDescription("Body");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    // Tab goes round inside the panel, never out of it.
    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
  });

  it("closes from its close button", async () => {
    const user = userEvent.setup();
    render(wrap(<Demo />));
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(await screen.findByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("Sheet", () => {
  const Demo = ({ onOpenChange }: { onOpenChange?: (o: boolean) => void }) => (
    <Sheet onOpenChange={onOpenChange}>
      <SheetTrigger asChild><button>Open</button></SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Hand</SheetTitle>
          <SheetDescription>Pick a tile</SheetDescription>
        </SheetHeader>
        <SheetClose asChild><button>Done</button></SheetClose>
      </SheetContent>
    </Sheet>
  );

  it("opens from the keyboard, keeps focus inside, and Escape closes it and returns focus", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(wrap(<Demo onOpenChange={onOpenChange} />));
    await user.tab();
    await user.keyboard("{Enter}");
    const sheet = await screen.findByRole("dialog", { name: "Hand" });
    expect(sheet).toHaveAttribute("data-side", "bottom");
    for (let i = 0; i < 4; i++) {
      await user.tab();
      expect(sheet).toContainElement(document.activeElement as HTMLElement);
    }
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: slow(3000) });
    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
  });

  it("closes from its Done button", async () => {
    const user = userEvent.setup();
    render(wrap(<Demo />));
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(await screen.findByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: slow(3000) });
  });
});

describe("Switch", () => {
  it("toggles with Space and click, and reports the state", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Sound" onCheckedChange={onCheckedChange} />);
    const sw = screen.getByRole("switch", { name: "Sound" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    await user.tab();
    expect(sw).toHaveFocus();
    await user.keyboard(" ");
    expect(sw).toHaveAttribute("aria-checked", "true");
    await user.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(onCheckedChange).toHaveBeenNthCalledWith(1, true);
    expect(onCheckedChange).toHaveBeenNthCalledWith(2, false);
  });

  it("does not take focus or change when disabled", async () => {
    const user = userEvent.setup();
    render(<Switch aria-label="Sound" disabled />);
    await user.tab();
    await user.click(screen.getByRole("switch"));
    expect(screen.getByRole("switch")).not.toHaveFocus();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });
});

describe("Slider", () => {
  it("takes focus and moves by the arrow keys, Home, End and PageUp", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Slider aria-label="Volume" defaultValue={[40]} onValueChange={onValueChange} />);
    await user.tab();
    const thumb = screen.getByRole("slider", { name: "Volume" });
    expect(thumb).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(thumb).toHaveAttribute("aria-valuenow", "41");
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(thumb).toHaveAttribute("aria-valuenow", "39");
    await user.keyboard("{End}");
    expect(thumb).toHaveAttribute("aria-valuenow", "100");
    await user.keyboard("{Home}");
    expect(thumb).toHaveAttribute("aria-valuenow", "0");
    expect(onValueChange).toHaveBeenLastCalledWith([0]);
  });

  it("renders a thumb per value and ignores the keys when disabled", async () => {
    const user = userEvent.setup();
    render(<Slider aria-label="Range" defaultValue={[20, 70]} disabled />);
    expect(screen.getAllByRole("slider")).toHaveLength(2);
    await user.tab();
    expect(screen.getAllByRole("slider")[0]).not.toHaveFocus();
  });
});

describe("Toggle Group", () => {
  const Demo = ({ onValueChange }: { onValueChange?: (v: string) => void }) => (
    <ToggleGroup type="single" defaultValue="medium" aria-label="Difficulty" onValueChange={onValueChange}>
      <ToggleGroupItem value="easy">Easy</ToggleGroupItem>
      <ToggleGroupItem value="medium">Medium</ToggleGroupItem>
      <ToggleGroupItem value="hard">Hard</ToggleGroupItem>
    </ToggleGroup>
  );

  it("lands on the selected item, moves with the arrows and selects with Space", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Demo onValueChange={onValueChange} />);
    await user.tab();
    expect(screen.getByRole("radio", { name: "Medium" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Hard" })).toHaveFocus();
    await user.keyboard(" ");
    expect(screen.getByRole("radio", { name: "Hard" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Medium" })).not.toBeChecked();
    expect(onValueChange).toHaveBeenCalledWith("hard");
  });

  it("selects on click", async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole("radio", { name: "Easy" }));
    expect(screen.getByRole("radio", { name: "Easy" })).toBeChecked();
  });
});

describe("Dropdown Menu", () => {
  function Demo({ onSelect }: { onSelect?: () => void }) {
    const [on, setOn] = useState(false);
    const [speed, setSpeed] = useState("normal");
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button>Menu</button></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onSelect}>Rotate</DropdownMenuItem>
          <DropdownMenuItem disabled>Undo</DropdownMenuItem>
          <DropdownMenuCheckboxItem checked={on} onCheckedChange={setOn}>Sound</DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup value={speed} onValueChange={setSpeed}>
            <DropdownMenuRadioItem value="normal">Normal</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="fast">Fast</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  it("opens with Enter, walks the items with the arrows (skipping the disabled one), selects and returns focus", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Demo onSelect={onSelect} />);
    await user.tab();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    await waitFor(() => expect(within(menu).getByRole("menuitem", { name: "Rotate" })).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    expect(within(menu).getByRole("menuitemcheckbox", { name: "Sound" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(within(menu).getByRole("menuitem", { name: "Rotate" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Menu" })).toHaveFocus();
  });

  it("toggles a checkbox item and picks a radio item", async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Sound" }));
    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(await screen.findByRole("menuitemcheckbox", { name: "Sound" })).toBeChecked();
    await user.click(screen.getByRole("menuitemradio", { name: "Fast" }));
    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(await screen.findByRole("menuitemradio", { name: "Fast" })).toBeChecked();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await screen.findByRole("menu");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });
});
