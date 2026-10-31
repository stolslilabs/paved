import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { PLATE_COMPACT } from "./plate";
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
function Cycling({ kind, size, side }: { kind: TokenKind; size?: ResourcePlateProps["size"]; side?: ResourcePlateProps["side"] }) {
  const u = UNIT[kind];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => (s + 1) % 3), 1800);
    return () => clearInterval(timer);
  }, []);
  const amount = step === 1 ? u.start + u.step : step === 2 ? u.start - u.step / 2n : u.start;
  return <ResourcePlate kind={kind} amount={amount} decimals={u.decimals} fraction={u.fraction} size={size} side={side} tone={kind === "cobbles" ? "invite" : "default"} />;
}

/**
 * USDC: a rounded box, its icon over the right end, hiding the border. No plate carries a "+" (#925). The icon is
 * bare (#213): no disc behind it, 48 px over the 32 px box, so it stands past the plate above and below.
 */
export const Usdc: Story = {};
/** PAVED: both ends bare, the left one with no "+" (#925); the balances' tap is the whole plate. */
export const Paved: Story = { args: { kind: "paved", amount: UNIT.paved.start, decimals: 18 } };
export const Vpaved: Story = { args: { kind: "vpaved", amount: UNIT.vpaved.start, decimals: 18 } };
/** The Cobbles' plate: a gold edge and a slow shine, an invitation to the packs without a "+" (#925). */
export const Cobbles: Story = { args: { kind: "cobbles", amount: 240n, decimals: 0, fraction: 0, tone: "invite" } };
/** No source on this network: a dash. */
export const Unavailable: Story = { args: { amount: null } };
/** From `desktop`: a 36 px box under a 52 px icon, bare (#213). */
export const Large: Story = { args: { size: "md" } };
export const LargeCobbles: Story = { args: { kind: "cobbles", amount: 240n, decimals: 0, fraction: 0, tone: "invite", size: "md" } };

/** Every plate at both sizes, and mirrored (`side="left"`, the plates on the left of the screen, #829). */
export const AllPlates: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      {(["right", "left"] as const).map((side) =>
        (["sm", "md"] as const).map((size) => (
          <div key={`${side}-${size}`} className={side === "left" ? "flex flex-col items-start gap-1" : "flex flex-col items-end gap-1"}>
            {(Object.keys(UNIT) as TokenKind[]).map((kind) => (
              <ResourcePlate key={kind} kind={kind} amount={UNIT[kind].start} decimals={UNIT[kind].decimals} fraction={UNIT[kind].fraction} size={size} side={side} tone={kind === "cobbles" ? "invite" : "default"} />
            ))}
          </div>
        )),
      )}
    </div>
  ),
};
/** The mirrored plate (#829): the icon over the left end. */
export const Mirrored: Story = { args: { kind: "cobbles", amount: 240n, decimals: 0, fraction: 0, tone: "invite", side: "left" } };
export const MirroredUsdc: Story = { args: { side: "left" } };

/** A gain, once: the count up, the green, the "+N" rising and the icon's pop. */
function Once({ kind, by, side }: { kind: TokenKind; by: bigint; side?: ResourcePlateProps["side"] }) {
  const u = UNIT[kind];
  const [amount, setAmount] = useState(u.start);
  useEffect(() => {
    const timer = setTimeout(() => setAmount(u.start + by), 600);
    return () => clearTimeout(timer);
  }, [u.start, by]);
  return <ResourcePlate kind={kind} amount={amount} decimals={u.decimals} fraction={u.fraction} side={side} tone={kind === "cobbles" ? "invite" : "default"} />;
}
export const Gain: Story = { render: () => <div className="pt-6"><Once kind="cobbles" by={100n} /></div> };
/** A loss, once: the count down, the warning's colour, the "−N" dropping and the icon's dip. */
export const Loss: Story = { render: () => <div className="pt-6"><Once kind="paved" by={-UNIT.paved.step} /></div> };
export const MirroredGain: Story = { render: () => <div className="pt-6"><Once kind="cobbles" by={100n} side="left" /></div> };

/** A change up and down for each currency, at both sizes. */
export const Changes: Story = {
  render: () => (
    <div className="flex flex-col gap-8 pt-4">
      {(["sm", "md"] as const).map((size) => (
        <div key={size} className="flex flex-wrap gap-6">
          {(Object.keys(UNIT) as TokenKind[]).map((kind) => (
            <Cycling key={kind} kind={kind} size={size} />
          ))}
          <Cycling kind="cobbles" size={size} side="left" />
        </div>
      ))}
    </div>
  ),
};
/** Reduced motion: the figure changes with a brief colour flash; nothing moves. */
export const ChangesReducedMotion: Story = { ...Changes, parameters: { reducedMotion: "always" } };

/**
 * PLATE-WIDTH (#860): a currency's plate has one width at each size (`fixed`), no "+" (#925), whatever its figure; the figure at the side away from the icon, compact from 10,000 (`PLATE_COMPACT`). 0, "9,999.99" and
 * 1,234,567 for each currency.
 */
export const Fixed: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      {(["sm", "md"] as const).map((size) => (
        <div key={size} className="flex flex-col items-end gap-1">
          {(Object.keys(UNIT) as TokenKind[]).flatMap((kind) =>
            // In hundredths: 0, 9,999.99 and 1,234,567 (the Cobbles whole: 0, 9,999 and 1,234,567).
            [0n, 999_999n, 123_456_700n].map((hundredths) => {
              const { decimals, fraction } = UNIT[kind];
              const amount = decimals === 0 ? hundredths / 100n : hundredths * 10n ** BigInt(decimals - 2);
              return <ResourcePlate key={`${kind}-${hundredths}`} fixed compactFrom={PLATE_COMPACT[size]} kind={kind} amount={amount} decimals={decimals} fraction={fraction} size={size} tone={kind === "cobbles" ? "invite" : "default"} />;
            }),
          )}
        </div>
      ))}
    </div>
  ),
};
