import type { Meta, StoryObj } from "@storybook/react-vite";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AVATAR_PARTS,
  AVATAR_PART_BITS,
  AVATAR_PART_KEYS,
  AVATAR_USED_BITS,
  AVATAR_VALUE_BITS,
  avatarKey,
  decodeAvatar,
  encodeAvatar,
  randomAvatar,
  seededRandom,
  type Avatar,
  type AvatarStillStats,
  type AvatarStyle,
} from "@paved/renderer";
import { Button } from "../../components/ui/button";
import { PROGRESS } from "../../mocks/players";
import { AvatarPreview3D, AvatarStill, PART_TITLES, RING_SIZES, RingedAvatar, SHEET_BASE, useAvatarRender } from "./avatar-kit";

type LookArgs = Avatar & { look: AvatarStyle; autoTurn: boolean };

/** A part's control: its variants by name, the value its id. */
const partControl = (part: (typeof AVATAR_PART_KEYS)[number]) => ({
  control: { type: "select" as const, labels: Object.fromEntries(AVATAR_PARTS[part].map((name, id) => [id, `${id} · ${name}`])) },
  options: AVATAR_PARTS[part].map((_, id) => id),
  table: { category: "parts" },
});

const avatarOf = (args: LookArgs): Avatar => Object.fromEntries(AVATAR_PART_KEYS.map((k) => [k, args[k]])) as Avatar;

/** The avatar's part names, as a line. */
function PartList({ avatar }: { avatar: Avatar }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      {AVATAR_PART_KEYS.map((part) => (
        <div key={part} className="contents">
          <dt className="text-muted-foreground">{PART_TITLES[part]}</dt>
          <dd className="text-foreground">{AVATAR_PARTS[part][avatar[part]]}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The stored value of an avatar. */
function Code({ avatar }: { avatar: Avatar }) {
  return <code className="numeric rounded bg-muted px-2 py-1 text-xs break-all text-foreground">{avatarKey(avatar)}</code>;
}

/** The creator's view, as PR 2 would lay it out on a phone: the turning head on top, the stills at the menus' sizes under it. */
function Playground(args: LookArgs) {
  const avatar = avatarOf(args);
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-5 p-4">
      <AvatarPreview3D avatar={avatar} style={args.look} autoTurn={args.autoTurn} size={260} />
      <div className="flex items-end gap-4">
        {RING_SIZES.map((size) => (
          <RingedAvatar key={size} avatar={avatar} size={size} progress={PROGRESS.partWay} style={args.look} />
        ))}
      </div>
      <Code avatar={avatar} />
      <PartList avatar={avatar} />
    </div>
  );
}

/**
 * The avatar's look (AVATAR-LOOK, #626 PR 1): a Minecraft-like head of voxels in the board's palette, seen in three quarters,
 * on a background in its circle. Stories only: nothing is wired into the app. The creator page (PR 2) comes after the
 * owner's validation and the avatar on chain (#627).
 *
 * The menus show a still image of it (40, 64 and 128 px), rendered once by the page's one still renderer and cached: never a
 * live WebGL context per avatar. The creator shows one live 3D preview, turned by a drag.
 */
const meta = {
  title: "Avatar/Look",
  component: Playground,
  parameters: { layout: "fullscreen" },
  argTypes: {
    ...Object.fromEntries(AVATAR_PART_KEYS.map((part) => [part, partControl(part)])),
    look: { control: "inline-radio", options: ["voxel", "grid"], description: "True voxels (the proposal), or a cube painted with 8 x 8 face grids and a hat layer (Minecraft's)" },
    autoTurn: { control: "boolean", description: "The preview turns on its own (never under reduced motion)" },
  },
  args: { ...SHEET_BASE, hair: 5, beard: 2, headwear: 0, accessory: 1, background: 10, look: "voxel", autoTurn: true },
} satisfies Meta<LookArgs>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Every part as a control: pick a variant of each and see the preview and the stills follow. */
export const Creator: Story = {};

/** The default avatar: every part at variant 0, the one a player who chose none shows (the value 0 decodes to it). */
export const Default: Story = { args: { ...decodeAvatar(0n), look: "voxel", autoTurn: true } };

/** A random avatar at each press; the seed makes a run repeatable. */
function Randomiser({ look }: { look: AvatarStyle }) {
  const [seed, setSeed] = useState(626);
  const avatar = useMemo(() => randomAvatar(seededRandom(seed)), [seed]);
  const batch = useMemo(() => Array.from({ length: 12 }, (_, i) => randomAvatar(seededRandom(seed * 100 + i))), [seed]);
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 p-4">
      <AvatarPreview3D avatar={avatar} style={look} size={240} />
      <div className="flex items-center gap-3">
        <Button onClick={() => setSeed((s) => s + 1)}>Randomise</Button>
        <span className="numeric text-xs text-muted-foreground">seed {seed}</span>
      </div>
      <Code avatar={avatar} />
      <PartList avatar={avatar} />
      <ul className="grid grid-cols-4 gap-3 sm:grid-cols-6">
        {batch.map((a) => (
          <li key={avatarKey(a)}>
            <AvatarStill avatar={a} size={64} style={look} />
          </li>
        ))}
      </ul>
    </div>
  );
}
export const Randomise: Story = { render: (args) => <Randomiser look={args.look} /> };

/** The avatar at 40, 64 and 128 px inside #625's XP ring and level badge, for a handful of avatars and ring states. */
function InRing({ look }: { look: AvatarStyle }) {
  const avatars = useMemo(() => [SHEET_BASE, ...Array.from({ length: 4 }, (_, i) => randomAvatar(seededRandom(9_000 + i)))], []);
  const states = [PROGRESS.start, PROGRESS.partWay, PROGRESS.nearlyFull, PROGRESS.partWay, PROGRESS.stress];
  return (
    <div className="flex flex-col gap-6 p-4">
      {avatars.map((avatar, i) => (
        <div key={avatarKey(avatar)} className="flex flex-wrap items-center gap-6">
          {RING_SIZES.map((size) => (
            <RingedAvatar key={size} avatar={avatar} size={size} progress={states[i]} style={look} />
          ))}
        </div>
      ))}
    </div>
  );
}
export const InTheRing: Story = { render: (args) => <InRing look={args.look} /> };

/** The creator's turning 3D preview, large; the readout counts the frames it drew and its draws. */
function Preview({ avatar, look, autoTurn }: { avatar: Avatar; look: AvatarStyle; autoTurn: boolean }) {
  const [stats, setStats] = useState({ frames: 0, draws: 0 });
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 p-4">
      <AvatarPreview3D avatar={avatar} style={look} autoTurn={autoTurn} size={320} onStats={setStats} />
      <p className="numeric text-xs text-muted-foreground">
        {stats.frames} frames · {stats.draws} draw{stats.draws === 1 ? "" : "s"} · drag to turn
      </p>
    </div>
  );
}
export const Preview3D: Story = { render: (args) => <Preview avatar={avatarOf(args)} look={args.look} autoTurn={args.autoTurn} /> };

/** The two looks side by side: true voxels (left, the proposal) and the 8 x 8 face grid with its hat layer (right). */
function Looks() {
  const avatars = useMemo(() => [SHEET_BASE, { ...SHEET_BASE, headwear: 6, beard: 4 }, { ...SHEET_BASE, hair: 3, headwear: 7, accessory: 2 }, randomAvatar(seededRandom(31))], []);
  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="grid grid-cols-2 gap-4 text-center text-sm text-muted-foreground">
        <span>Voxels</span>
        <span>8 x 8 grid</span>
      </div>
      {avatars.map((avatar) => (
        <div key={avatarKey(avatar)} className="grid grid-cols-2 justify-items-center gap-4">
          <AvatarStill avatar={avatar} size={128} style="voxel" />
          <AvatarStill avatar={avatar} size={128} style="grid" />
        </div>
      ))}
    </div>
  );
}
export const VoxelsOrGrid: Story = { render: () => <Looks /> };

/**
 * What a still costs: renders `count` random avatars at 40, 64 and 128 px (each a new render), then asks for them all again
 * (each from the cache). The figures are this browser's: on software WebGL they are not a measure.
 */
function Cost({ look }: { look: AvatarStyle }) {
  const mod = useAvatarRender();
  const [result, setResult] = useState<{ stats: AvatarStillStats; renderer: string; perSize: Record<number, number>; again: number; live: boolean } | null>(null);
  const run = useCallback(() => {
    if (!mod) return;
    const stills = new mod.AvatarStills({ idleMs: 1_000 });
    const avatars = Array.from({ length: 30 }, (_, i) => randomAvatar(seededRandom(4_000 + i)));
    const perSize: Record<number, number> = {};
    for (const size of RING_SIZES) {
      const start = performance.now();
      for (const avatar of avatars) stills.get(avatar, { size, style: look });
      perSize[size] = (performance.now() - start) / avatars.length;
    }
    const again = performance.now();
    for (const size of RING_SIZES) for (const avatar of avatars) stills.get(avatar, { size, style: look });
    const againMs = (performance.now() - again) / (avatars.length * RING_SIZES.length);
    setResult({ stats: stills.stats(), renderer: rendererName(), perSize, again: againMs, live: stills.live });
    setTimeout(() => setResult((r) => r && { ...r, live: stills.live }), 1_500);
  }, [mod, look]);
  useEffect(() => {
    const timer = setTimeout(run, 300);
    return () => clearTimeout(timer);
  }, [run]);
  const ms = (v: number) => `${v.toFixed(2)} ms`;
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-4 text-sm text-foreground" data-slot="avatar-cost">
      <Button onClick={run} disabled={!mod}>
        Run again
      </Button>
      {result && (
        <table className="numeric w-full text-left text-xs">
          <tbody>
            <tr>
              <th className="py-1 pr-3 font-normal text-muted-foreground">WebGL</th>
              <td>{result.renderer}</td>
            </tr>
            <tr>
              <th className="py-1 pr-3 font-normal text-muted-foreground">Context creation (once)</th>
              <td>{ms(result.stats.contextMs)}</td>
            </tr>
            {RING_SIZES.map((size) => (
              <tr key={size}>
                <th className="py-1 pr-3 font-normal text-muted-foreground">
                  Render at {size} px (×{window.devicePixelRatio}), mean of 30
                </th>
                <td>{ms(result.perSize[size])}</td>
              </tr>
            ))}
            <tr>
              <th className="py-1 pr-3 font-normal text-muted-foreground">Worst render</th>
              <td>{ms(result.stats.maxMs)}</td>
            </tr>
            <tr>
              <th className="py-1 pr-3 font-normal text-muted-foreground">From the cache, mean of 90</th>
              <td>{ms(result.again)}</td>
            </tr>
            <tr>
              <th className="py-1 pr-3 font-normal text-muted-foreground">Renders · cache hits · contexts</th>
              <td>
                {result.stats.renders} · {result.stats.hits} · {result.stats.contexts}
              </td>
            </tr>
            <tr>
              <th className="py-1 pr-3 font-normal text-muted-foreground">Context held now</th>
              <td data-slot="context-live">{result.live ? "yes (released 1 s after the last render)" : "no"}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

/** The WebGL renderer's name, as the board's stories report it. */
function rendererName(): string {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    const name = info ? String(gl?.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "unknown";
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return /swiftshader|llvmpipe|software/i.test(name) ? `software (${name})` : "GPU";
  } catch {
    return "none";
  }
}
export const RenderCost: Story = { render: (args) => <Cost look={args.look} /> };

/** The compact format: an avatar is one 128-bit value, a byte a part (for #627). */
function Format({ avatar }: { avatar: Avatar }) {
  const value = encodeAvatar(avatar);
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-4 text-sm text-foreground">
      <p className="text-muted-foreground">
        {AVATAR_USED_BITS} of {AVATAR_VALUE_BITS} bits: the version, then {AVATAR_PART_BITS} bits a part; the rest reserved (0).
      </p>
      <Code avatar={avatar} />
      <table className="numeric w-full text-left text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="py-1 font-normal">Bits</th>
            <th className="font-normal">Field</th>
            <th className="font-normal">Id</th>
            <th className="font-normal">Variant</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-1">0–7</td>
            <td>version</td>
            <td>{Number(value & 0xffn)}</td>
            <td />
          </tr>
          {AVATAR_PART_KEYS.map((part, i) => (
            <tr key={part}>
              <td className="py-1">
                {(i + 1) * AVATAR_PART_BITS}–{(i + 2) * AVATAR_PART_BITS - 1}
              </td>
              <td>{PART_TITLES[part]}</td>
              <td>{avatar[part]}</td>
              <td>{AVATAR_PARTS[part][avatar[part]]}</td>
            </tr>
          ))}
          <tr>
            <td className="py-1">
              {AVATAR_USED_BITS}–{AVATAR_VALUE_BITS - 1}
            </td>
            <td>reserved</td>
            <td>0</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
export const CompactFormat: Story = { render: (args) => <Format avatar={avatarOf(args)} /> };
