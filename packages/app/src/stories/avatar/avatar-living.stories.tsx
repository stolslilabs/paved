import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef, useState } from "react";
import { loadAvatarBoxes, loadAvatarKing, type KingAvatar, loadAvatarRig, randomAvatar, type Avatar, type BoxAvatar, type Emote, type LivingAvatar, type LivingAvatarOptions, type Traits } from "@paved/renderer";
import { Button } from "../../components/ui/button";
import { SOURCE_ASSETS } from "../../mocks/assets";
import { AvatarStill } from "./avatar-kit";
import { KING_FACE } from "./king-face";

/**
 * AVATAR-LIVING (exploration, not wired): the avatar as a living bust (`avatar-rig.ts`) on a painted backdrop. The backdrops are
 * a prototype's, cut from a sheet generated with OpenAI's image model through the Codex CLI, and `target-king.webp` is the render
 * target the king is matched to: all in `asset-sources/avatar-proto/`, which only Storybook serves (the client's build ships none).
 */
const PROTO = `${SOURCE_ASSETS}/avatar-proto`;
const BACKDROPS = ["village", "fields", "forest", "mountains", "river", "castle", "night", "wonder"] as const;
type Backdrop = (typeof BACKDROPS)[number];
const EMOTE_LIST: Emote[] = ["wave", "cheer", "dance", "think", "sad", "clap"];

/** The four characters of the render target (Codex), in the catalogue's parts. */
const CAST: { name: string; avatar: Avatar; backdrop: Backdrop }[] = [
  { name: "King", backdrop: "village", avatar: { skin: 2, hairColour: 2, eyes: 0, eyebrows: 1, mouth: 0, hair: 0, beard: 4, headwear: 6, accessory: 0, background: 4 } },
  { name: "Farmer", backdrop: "fields", avatar: { skin: 0, hairColour: 3, eyes: 0, eyebrows: 2, mouth: 0, hair: 3, beard: 0, headwear: 2, accessory: 7, background: 4 } },
  { name: "Warrior", backdrop: "mountains", avatar: { skin: 1, hairColour: 5, eyes: 0, eyebrows: 4, mouth: 1, hair: 3, beard: 5, headwear: 5, accessory: 6, background: 0 } },
  { name: "Wizard", backdrop: "night", avatar: { skin: 1, hairColour: 5, eyes: 0, eyebrows: 1, mouth: 0, hair: 1, beard: 4, headwear: 7, accessory: 1, background: 4 } },
];

/** A living bust in a circle on its backdrop; `onReady` hands its player out (to play emotes). */
function LivingBust({ avatar, backdrop, size, onReady, options }: { avatar: Avatar; backdrop: Backdrop; size: number; onReady?: (living: LivingAvatar) => void; options?: LivingAvatarOptions }) {
  const ref = useRef<HTMLDivElement>(null);
  const living = useRef<LivingAvatar | null>(null);
  useEffect(() => {
    let gone = false;
    void loadAvatarRig().then((m) => {
      if (gone || !ref.current) return;
      living.current = new m.LivingAvatar(ref.current, avatar, options);
      onReady?.(living.current);
    });
    return () => {
      gone = true;
      living.current?.dispose();
      living.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- built once; the avatar follows below
  }, []);
  useEffect(() => living.current?.setAvatar(avatar), [avatar]);
  return (
    <div
      ref={ref}
      style={{
        width: size,
        maxWidth: "100%",
        aspectRatio: "1",
        borderRadius: "50%",
        overflow: "hidden",
        backgroundImage: `url(${PROTO}/${backdrop}.webp)`,
        backgroundSize: "cover",
        boxShadow: "0 0 0 4px #3a3f4a, 0 10px 30px #0008",
      }}
    />
  );
}

function Playground() {
  const [avatar, setAvatar] = useState<Avatar>(CAST[0]!.avatar);
  const [variant, setVariant] = useState<"v1" | "v2" | "hd">("hd");
  const options: LivingAvatarOptions = variant === "hd" ? { model: "hd-king", look: "v2", face: KING_FACE } : { look: variant };
  const [backdrop, setBackdrop] = useState<Backdrop>("castle");
  const [living, setLiving] = useState<LivingAvatar | null>(null);
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setMs(living?.frameMs ?? 0), 500);
    return () => clearInterval(timer);
  }, [living]);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: 24 }}>
      <LivingBust key={variant} avatar={avatar} backdrop={backdrop} size={320} onReady={setLiving} options={options} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
        {(["v1", "v2", "hd"] as const).map((v) => (
          <Button key={v} variant={v === variant ? "default" : "ghost"} size="sm" onClick={() => setVariant(v)}>
            {v === "hd" ? "HD king" : `catalogue ${v}`}
          </Button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
        {EMOTE_LIST.map((e) => (
          <Button key={e} variant="secondary" onClick={() => living?.play(e)}>
            {e}
          </Button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
        {BACKDROPS.map((b) => (
          <Button key={b} variant={b === backdrop ? "default" : "ghost"} size="sm" onClick={() => setBackdrop(b)}>
            {b}
          </Button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
        {CAST.map((c) => (
          <Button key={c.name} variant="ghost" size="sm" onClick={() => setAvatar(c.avatar)}>
            {c.name}
          </Button>
        ))}
        <Button size="sm" onClick={() => setAvatar(randomAvatar(Math.random))}>
          Randomise
        </Button>
      </div>
      <p className="numeric text-xs text-muted-foreground">render {ms.toFixed(2)} ms a frame</p>
    </div>
  );
}

const meta = {
  title: "Avatar/Living (exploration)",
  parameters: { layout: "fullscreen", reducedMotion: "never" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** One bust, its emotes on the buttons, the backdrops and the cast to try. The idle runs by itself: breath, sway, blinks, glances. */
export const Playground_: Story = { name: "Playground", render: () => <Playground /> };

/** Today's still beside the living bust, the same avatar. */
export const BeforeAfter: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 48, alignItems: "center", justifyContent: "center", padding: 32 }}>
      <AvatarStill avatar={CAST[0]!.avatar} size={128} />
      <LivingBust avatar={CAST[0]!.avatar} backdrop="village" size={256} />
    </div>
  ),
};

/** The render target's four characters, each on its backdrop (four contexts: a story's, not the app's way). */
export const Cast: Story = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 32, justifyContent: "center", maxWidth: 2 * 256 + 32 + 64, margin: "0 auto", padding: 32 }}>
      {CAST.map((c) => (
        <LivingBust key={c.name} avatar={c.avatar} backdrop={c.backdrop} size={256} />
      ))}
    </div>
  ),
};

/** The render target (Codex) beside the prototype's stages: the catalogue's bust lit as v1, then v2 (spot, bevels), then the HD king. */
export const Compare: Story = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "center", padding: 24 }}>
      <img src={`${PROTO}/target-king.webp`} alt="" width={256} height={256} style={{ maxWidth: "100%", height: "auto", borderRadius: "50%", boxShadow: "0 0 0 4px #3a3f4a" }} />
      <LivingBust avatar={CAST[0]!.avatar} backdrop="village" size={256} options={{ look: "v1" }} />
      <LivingBust avatar={CAST[0]!.avatar} backdrop="village" size={256} options={{ model: "hd-king", look: "v2" }} />
      <LivingBust avatar={CAST[0]!.avatar} backdrop="village" size={256} options={{ model: "hd-king", look: "v2", face: KING_FACE }} />
    </div>
  ),
};

/** The king as free cuboids (`avatar-boxes.ts`): the backdrop in the scene, its ambient occlusion the screen's. */
function BoxBust({ size, backdrop = "village", onReady, ao }: { size: number; backdrop?: Backdrop; onReady?: (b: BoxAvatar) => void; ao?: boolean | "debug" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let gone = false;
    let avatar: BoxAvatar | null = null;
    void loadAvatarBoxes().then((m) => {
      if (gone || !ref.current) return;
      avatar = new m.BoxAvatar(ref.current, CAST[0]!.avatar, { backdrop: `${PROTO}/${backdrop}.webp`, ao });
      onReady?.(avatar);
    });
    return () => {
      gone = true;
      avatar?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- built once
  }, []);
  return <div ref={ref} style={{ width: size, maxWidth: "100%", aspectRatio: "1", borderRadius: "50%", overflow: "hidden", boxShadow: "0 0 0 4px #3a3f4a" }} />;
}

/** The target beside the free-cuboid king, with and without the screen's ambient occlusion. */
export const Boxes: Story = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "center", padding: 24 }}>
      <img src={`${PROTO}/target-king.webp`} alt="" width={256} height={256} style={{ maxWidth: "100%", height: "auto", borderRadius: "50%", boxShadow: "0 0 0 4px #3a3f4a" }} />
      <BoxBust size={256} />
      <LivingBust avatar={CAST[0]!.avatar} backdrop="village" size={256} options={{ model: "hd-king", look: "v2", face: KING_FACE }} />
    </div>
  ),
};

function BoxPlayground() {
  const [avatar, setAvatar] = useState<BoxAvatar | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: 24 }}>
      <BoxBust size={320} onReady={setAvatar} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
        {EMOTE_LIST.map((e) => (
          <Button key={e} variant="secondary" onClick={() => avatar?.play(e)}>
            {e}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** The free-cuboid king living: the idle, and the emotes on the buttons. */
export const BoxesPlayground: Story = { render: () => <BoxPlayground /> };

/** The king, v4 (`avatar-king.ts`): the target's construction and colours, its backdrop blurred. */
function KingBust({ size, still, yaw, eyesShut, traits, onReady }: { size: number; still?: boolean; yaw?: number; eyesShut?: boolean; traits?: Partial<Traits>; onReady?: (k: KingAvatar) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let gone = false;
    let king: KingAvatar | null = null;
    void loadAvatarKing().then((m) => {
      if (gone || !ref.current) return;
      // Checks: the lights' intensities from the URL (?key=&fill=), for the calibration sweep.
      const q = new URLSearchParams(window.location.search);
      const light = q.has("key") ? { key: Number(q.get("key")), fill: Number(q.get("fill")) } : undefined;
      // Checks: the traits from the URL (?traits=hair-blond.beard-none), over the props'.
      const fromUrl = q.has("traits") ? m.traitsFrom(q.get("traits")) : undefined;
      king = new m.KingAvatar(ref.current, { backdrop: `${PROTO}/village.webp`, still, yaw, eyesShut, light, traits: fromUrl ?? traits });
      // The checks read it (its projection, `screenOf`).
      (window as unknown as { __king?: KingAvatar }).__king = king;
      onReady?.(king);
    });
    return () => {
      gone = true;
      king?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- built once
  }, []);
  return <div data-slot="king" ref={ref} style={{ width: size, maxWidth: "100%", aspectRatio: "1", borderRadius: "50%", overflow: "hidden" }} />;
}

/** The target and the king v4 at its rest pose, the same size, for an exact comparison. */
export const KingV4Compare: Story = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 32, justifyContent: "center", padding: 24, background: "#23262d" }}>
      <img data-slot="target" src={`${PROTO}/target-king.webp`} alt="" width={480} height={480} style={{ maxWidth: "100%", height: "auto", borderRadius: "50%" }} />
      <KingBust size={480} still />
    </div>
  ),
};

/** The target and the king v4 one over the other at half opacity: where they differ shows twice. */
export const KingV4Overlay: Story = {
  render: () => (
    <div style={{ position: "relative", width: "min(480px, calc(100% - 48px))", aspectRatio: "1", margin: 24 }}>
      <KingBust size={480} still />
      <img src={`${PROTO}/target-king.webp`} alt="" width={480} height={480} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", borderRadius: "50%", opacity: 0.5 }} />
    </div>
  ),
};

function KingPlayground() {
  const [king, setKing] = useState<KingAvatar | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: 24 }}>
      <KingBust size={320} onReady={setKing} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
        {EMOTE_LIST.map((e) => (
          <Button key={e} variant="secondary" onClick={() => king?.play(e)}>
            {e}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** The king v4 living: the idle and the emotes on the buttons. */
export const KingV4Playground: Story = { render: () => <KingPlayground /> };

/** The king v4 facing the camera, at rest: the face's features level and symmetric, checked without the turn. */
export const KingV4Front: Story = {
  render: () => (
    <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
      <KingBust size={480} still yaw={0} />
    </div>
  ),
};

/** The king v4 facing the camera, eyes shut: the lids must cover the eyes exactly. */
export const KingV4Blink: Story = {
  render: () => (
    <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
      <KingBust size={480} still yaw={0} eyesShut />
    </div>
  ),
};

/** The king v4 turned to show his left side head on, at rest: the side's blocks checked without the three-quarter's parallax. */
export const KingV4Side: Story = {
  render: () => (
    <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
      <KingBust size={480} still yaw={Math.PI / 2 - 0.12} />
    </div>
  ),
};

/** The king v4 alone and large, living: the recordings' (their script plays the emotes). */
export const KingV4Reel: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "min(540px, 100%)", aspectRatio: "1", background: "#23262d" }}>
      <KingBust size={500} />
    </div>
  ),
};

type KingModule = typeof import("@paved/renderer") extends { loadAvatarKing: () => Promise<infer M> } ? M : never;

/** The king module once loaded (its traits' options, for the pickers). */
function useKingModule() {
  const [m, setM] = useState<KingModule | null>(null);
  useEffect(() => {
    void loadAvatarKing().then(setM);
  }, []);
  return m;
}

/** A random pick of every trait. */
const randomTraits = (m: KingModule): Traits =>
  Object.fromEntries(Object.entries(m.TRAIT_OPTIONS).map(([k, options]) => [k, options[Math.floor(Math.random() * options.length)]])) as Traits;

function TraitsPlayground() {
  const m = useKingModule();
  const [traits, setTraits] = useState<Traits | null>(null);
  const [king, setKing] = useState<KingAvatar | null>(null);
  if (!m) return null;
  const shown = traits ?? m.KING_TRAITS;
  return (
    <div style={{ display: "flex", gap: 24, padding: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
      <KingBust key={m.traitsText(shown)} size={360} traits={shown} onReady={setKing} />
      <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "8px 12px", alignItems: "center", fontSize: 14 }}>
        {(Object.keys(m.TRAIT_OPTIONS) as (keyof Traits)[]).map((key) => (
          <label key={key} style={{ display: "contents" }}>
            <span>{key}</span>
            <select value={shown[key]} onChange={(e) => setTraits({ ...shown, [key]: e.target.value })}>
              {m.TRAIT_OPTIONS[key].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        ))}
        <span />
        <div style={{ display: "flex", gap: 8 }}>
          <Button size="sm" onClick={() => setTraits(randomTraits(m))}>
            Random
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setTraits(m.KING_TRAITS)}>
            King
          </Button>
        </div>
        <span />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxWidth: 260 }}>
          {EMOTE_LIST.map((e) => (
            <Button key={e} size="sm" variant="secondary" onClick={() => king?.play(e)}>
              {e}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The king's traits (`avatar-traits.ts`): a picker per trait, a random draw, the emotes on the buttons; the head follows the cursor. */
export const KingTraits: Story = { render: () => <TraitsPlayground /> };

/** Eight drawn characters side by side, every emote played by all at once (the combinations with the animations). */
const CAST_TRAITS: Partial<Traits>[] = [
  {},
  { skin: "deep", hair: "black", hairStyle: "short", beard: "goatee", eyes: "amber", headwear: "helmet", outfit: "red", pauldrons: "iron" },
  { skin: "pale", hair: "blond", hairStyle: "long", beard: "none", eyes: "blue", headwear: "feathered", accessory: "earrings", outfit: "green", pauldrons: "leather" },
  { skin: "tan", hair: "grey", beard: "long", eyes: "grey", headwear: "wizard", accessory: "glasses", outfit: "purple", pauldrons: "none" },
  { skin: "brown", hair: "ginger", hairStyle: "bald", beard: "moustache", eyes: "green", headwear: "none", accessory: "eyepatch", outfit: "black", pauldrons: "gold" },
  { skin: "peach", hair: "black", hairStyle: "long", beard: "full", eyes: "brown", headwear: "hood", outfit: "green", pauldrons: "leather" },
  { skin: "deep", hair: "grey", hairStyle: "bald", beard: "long", eyes: "blue", headwear: "crown", accessory: "earrings", outfit: "purple", pauldrons: "gold" },
  { skin: "pale", hair: "ginger", beard: "full", eyes: "green", headwear: "helmet", accessory: "eyepatch", outfit: "blue", pauldrons: "iron" },
];

function CastAll() {
  const kings = useRef<(KingAvatar | null)[]>([]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16, background: "#23262d" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {EMOTE_LIST.map((e) => (
          <Button key={e} size="sm" variant="secondary" onClick={() => kings.current.forEach((k) => k?.play(e))}>
            {e}
          </Button>
        ))}
      </div>
      <div data-slot="cast" style={{ display: "flex", flexWrap: "wrap", gap: 16, maxWidth: 4 * 220 + 3 * 16 }}>
        {CAST_TRAITS.map((t, i) => (
          <KingBust key={i} size={220} traits={t} onReady={(k) => (kings.current[i] = k)} />
        ))}
      </div>
    </div>
  );
}

/** Eight characters drawn from the traits, all playing the same emote: every layer seen moving at once. */
export const KingCast: Story = { render: () => <CastAll /> };
