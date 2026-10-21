import type { Meta, StoryObj } from "@storybook/react-vite";
import pavedMeadow from "../../assets/tokens/paved.svg";
import pavedRoof from "../../assets/tokens/variants/paved-roof.svg";
import pavedTile from "../../assets/tokens/variants/paved-tile.svg";
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

const VARIANTS = [
  { name: "A · Meadow coin", note: "grass rim, earth-road field, stone edge (the default, `paved.svg`)", src: pavedMeadow },
  { name: "B · Tile badge", note: "a tile from above: stone edge, grass field, the P in road earth", src: pavedTile },
  { name: "C · Roof coin", note: "city-roof rim, road field, the P in forest green", src: pavedRoof },
] as const;

/** For the owner to pick (#620): three PAVED icons in the tiles' colours, at 16, 24 and 64 px, on dark and on light. */
export const PavedVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {VARIANTS.map((v) => (
        <div key={v.name} className="flex flex-wrap items-center gap-6">
          <div className="w-56">
            <p className="text-sm font-semibold">{v.name}</p>
            <p className="text-xs text-muted-foreground">{v.note}</p>
          </div>
          {(["bg-background", "bg-foreground"] as const).map((bg) => (
            <div key={bg} className={`flex items-center gap-4 rounded-xl p-3 ${bg}`}>
              {[16, 24, 64].map((px) => (
                <img key={px} src={v.src} alt="" draggable={false} width={px} height={px} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  ),
};
