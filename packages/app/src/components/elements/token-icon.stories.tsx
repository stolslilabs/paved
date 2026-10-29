import type { Meta, StoryObj } from "@storybook/react-vite";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Amount } from "./amount";
import { Cobbles } from "./cobbles";
import { ResourcePlate } from "./resource-plate";
import { TOKEN_ICONS, TokenIcon, type TokenIconSize, type TokenKind } from "./token-icon";

const meta = { title: "Elements/TokenIcon", component: TokenIcon, parameters: { layout: "padded" }, args: { kind: "paved", size: "md" } } satisfies Meta<typeof TokenIcon>;
export default meta;
type Story = StoryObj<typeof meta>;

const KINDS = Object.keys(TOKEN_ICONS) as TokenKind[];
const SIZES: readonly { size: TokenIconSize; px: number }[] = [
  { size: "xs", px: 16 },
  { size: "sm", px: 20 },
  { size: "md", px: 24 },
  { size: "lg", px: 32 },
  { size: "xl", px: 48 },
  { size: "2xl", px: 64 },
];

/** Every kind at every size, on the app's dark surface and on a light one. */
function Grid({ surface }: { surface: "dark" | "light" }) {
  return (
    <div className={surface === "dark" ? "rounded-xl bg-background p-4 text-foreground" : "rounded-xl bg-foreground p-4 text-background"}>
      <table className="border-separate border-spacing-x-4 border-spacing-y-2 text-xs">
        <thead>
          <tr>
            <th />
            {SIZES.map(({ px }) => (
              <th key={px} className="font-normal">
                {px} px
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {KINDS.map((kind) => (
            <tr key={kind}>
              <th className="pr-2 text-left font-normal">{TOKEN_ICONS[kind].name}</th>
              {SIZES.map(({ size }) => (
                <td key={size} className="text-center align-middle">
                  <TokenIcon kind={kind} size={size} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const Default: Story = {};
/** The four icons at 16, 20, 24, 32, 48 and 64 px, on dark and on light. */
export const AllKinds: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Grid surface="dark" />
      <Grid surface="light" />
    </div>
  ),
};

const COIN_SURFACES = [
  { name: "Dark", className: "bg-background text-foreground" },
  { name: "Light", className: "bg-foreground text-background" },
] as const;

/**
 * PAVED's gold coin and vPAVED's silver one (#853): Font Awesome's `coin-front` with the Almendra "P", in the game icons' relief.
 * From 16 to 64 px beside the Cobbles and USDC, on dark and on light; in the balances' plates; in a sentence.
 */
export const Coins: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {COIN_SURFACES.map((surface) => (
        <section key={surface.name} aria-label={surface.name} className={`flex flex-col gap-3 rounded-xl p-3 ${surface.className}`}>
          <h3 className="text-sm font-semibold">{surface.name}</h3>
          {(["paved", "vpaved", "cobbles", "usdc"] as const).map((kind) => (
            <div key={kind} className="flex flex-wrap items-end gap-x-3 gap-y-2">
              <span className="w-16 text-xs">{TOKEN_ICONS[kind].name}</span>
              {SIZES.map(({ size }) => (
                <TokenIcon key={size} kind={kind} size={size} />
              ))}
            </div>
          ))}
        </section>
      ))}
      <section aria-label="In a plate" className="flex flex-col gap-2 text-foreground">
        <h3 className="text-sm font-semibold">In a plate</h3>
        <div className="flex flex-wrap items-start gap-3">
          {PLATE_KINDS.map((p) => (
            <ResourcePlate key={p.kind} {...p} size="sm" plus={p.kind !== "vpaved"} tone={p.kind === "cobbles" ? "invite" : "default"} />
          ))}
        </div>
      </section>
      <section aria-label="In a sentence" className="flex flex-col gap-2 text-foreground">
        <h3 className="text-sm font-semibold">In a sentence</h3>
        <p className="max-w-prose text-sm">
          Deposit <Amount value={250n * 10n ** 18n} token="paved" /> in the Vault and receive <Amount value={250n * 10n ** 18n} token="vpaved" />, then
          spend <Cobbles value={120} className="align-middle" /> on a pack bought with <Amount value={4_990_000n} token="usdc" />.
        </p>
        <p className="max-w-prose text-2xl">
          <Amount value={1_234n * 10n ** 17n} token="paved" /> · <Amount value={56n * 10n ** 18n} token="vpaved" />
        </p>
      </section>
    </div>
  ),
};

/** The gap and the insets of one balance, read from the page: the icon, the figure after it, the plate around them if any. */
function Measured({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  useLayoutEffect(() => {
    const measure = () => {
      const root = ref.current?.firstElementChild;
      const icon = root?.querySelector('[data-slot="token-icon"]');
      const figure = root?.querySelector(".numeric");
      if (!root || !icon || !figure) return;
      const r = (el: Element) => el.getBoundingClientRect();
      const px = (n: number) => `${Math.round(n * 10) / 10}`;
      const parts = [`gap ${px(r(figure).left - r(icon).right)}`];
      if (root.matches('[data-slot="resource-plate"]')) {
        const box = r(root);
        const border = parseFloat(getComputedStyle(root).borderLeftWidth);
        const last = [...root.children].filter((el) => !el.matches('[aria-hidden].absolute, [data-slot="resource-change"]')).at(-1)!;
        parts.push(`inset ${px(r(icon).left - box.left - border)} · ${px(r(icon).top - box.top - border)} · ${px(box.bottom - border - r(icon).bottom)}`, `end ${px(box.right - border - r(last).right)}`);
      }
      setText(`${parts.join(" · ")} px · icon ${px(r(icon).width)}`);
    };
    measure();
    void document.fonts.ready.then(measure);
  }, []);
  return (
    <div className="flex flex-col items-start gap-1">
      <div ref={ref}>{children}</div>
      <span className="numeric text-xs text-muted-foreground">{text}</span>
    </div>
  );
}

const PLATE_KINDS = [
  { kind: "cobbles", amount: 1250n, decimals: 0, fraction: 0 },
  { kind: "usdc", amount: 48_500_000n, decimals: 6, fraction: 2 },
  { kind: "paved", amount: 1_234n * 10n ** 17n, decimals: 18, fraction: 2 },
  { kind: "vpaved", amount: 56n * 10n ** 18n, decimals: 18, fraction: 2 },
] as const;

/**
 * The balances' spacing rule (`TOKEN_GAP`, #668), every balance side by side with its gap and insets measured on the page: the
 * gap between icon and figure is a quarter of the icon (`Amount`, `Cobbles`, the resource bar's plates, the Vault, the shop); in a
 * plate the icon has the same inset left, top and bottom, and the figure ends one inset plus one gap from the rim.
 */
export const BalanceSpacing: Story = {
  render: () => (
    <div className="flex flex-col gap-5 text-foreground">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Resource bar: plates (sm, the bar; md, the sheet)</h3>
        {(["sm", "md"] as const).map((size) => (
          <div key={size} className="flex flex-wrap items-start gap-4">
            {PLATE_KINDS.map((p) => (
              <Measured key={p.kind}>
                <ResourcePlate {...p} size={size} plus={p.kind === "cobbles"} tone={p.kind === "cobbles" ? "invite" : "default"} />
              </Measured>
            ))}
          </div>
        ))}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Amount (the Vault, prices) at 14 and 24 px</h3>
        {(["text-sm", "text-2xl"] as const).map((text) => (
          <div key={text} className="flex flex-wrap items-start gap-6">
            {(["usdc", "paved", "vpaved"] as const).map((token) => (
              <Measured key={token}>
                <Amount value={token === "usdc" ? 48_500_000n : 1_234n * 10n ** 17n} token={token} className={text} />
              </Measured>
            ))}
          </div>
        ))}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Cobbles (the shop, rewards) at sm, md and lg</h3>
        <div className="flex flex-wrap items-start gap-6">
          {(["sm", "md", "lg"] as const).map((size) => (
            <Measured key={size}>
              <Cobbles value={1250} size={size} />
            </Measured>
          ))}
        </div>
      </section>
    </div>
  ),
};
