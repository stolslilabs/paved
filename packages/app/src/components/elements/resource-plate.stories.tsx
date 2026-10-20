import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { ResourcePlate, type ResourcePlateProps } from "./resource-plate";
import type { TokenKind } from "./token-icon";

const meta = {
  title: "Elements/ResourcePlate",
  component: ResourcePlate,
  parameters: { layout: "padded" },
  args: { kind: "usdc", amount: 48_500_000n, decimals: 6, fraction: 2 },
} satisfies Meta<typeof ResourcePlate>;
export default meta;
type Story = StoryObj<typeof meta>;

const UNIT: Record<TokenKind, Pick<ResourcePlateProps, "decimals" | "fraction"> & { start: bigint; step: bigint }> = {
  usdc: { decimals: 6, fraction: 2, start: 48_500_000n, step: 6_000_000n },
  paved: { decimals: 18, fraction: 2, start: 142_350_000_000_000_000_000n, step: 12_500_000_000_000_000_000n },
  vpaved: { decimals: 18, fraction: 2, start: 1_250_400_000_000_000_000n, step: 250_000_000_000_000_000n },
  cobbles: { decimals: 0, fraction: 0, start: 240n, step: 100n },
};

/** The amount goes up, then down, then back, every 1.8 s: the pop and the "+N", then the dip and the "−N". */
function Cycling({ kind, size }: { kind: TokenKind; size?: ResourcePlateProps["size"] }) {
  const u = UNIT[kind];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => (s + 1) % 3), 1800);
    return () => clearInterval(timer);
  }, []);
  const amount = step === 1 ? u.start + u.step : step === 2 ? u.start - u.step / 2n : u.start;
  return <ResourcePlate kind={kind} amount={amount} decimals={u.decimals} fraction={u.fraction} size={size} plus={kind === "cobbles"} tone={kind === "cobbles" ? "invite" : "default"} />;
}

export const Usdc: Story = {};
export const Paved: Story = { args: { kind: "paved", amount: UNIT.paved.start, decimals: 18 } };
export const Vpaved: Story = { args: { kind: "vpaved", amount: UNIT.vpaved.start, decimals: 18 } };
/** The Cobbles' plate: a gold edge, a "+" and a slow shine, an invitation to the packs. */
export const Cobbles: Story = { args: { kind: "cobbles", amount: 240n, decimals: 0, fraction: 0, plus: true, tone: "invite" } };
/** No source on this network: a dash. */
export const Unavailable: Story = { args: { amount: null } };
export const Large: Story = { args: { size: "md" } };

/** A change up and down for each currency, at both sizes. */
export const Changes: Story = {
  render: () => (
    <div className="flex flex-col gap-8 pt-4">
      {(["sm", "md"] as const).map((size) => (
        <div key={size} className="flex flex-wrap gap-6">
          {(Object.keys(UNIT) as TokenKind[]).map((kind) => (
            <Cycling key={kind} kind={kind} size={size} />
          ))}
        </div>
      ))}
    </div>
  ),
};
/** Reduced motion: the figure changes with a brief colour flash; nothing moves. */
export const ChangesReducedMotion: Story = { ...Changes, parameters: { reducedMotion: "always" } };
