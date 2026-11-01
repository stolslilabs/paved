import type { Meta, StoryObj } from "@storybook/react-vite";
import { type RefObject, useEffect, useRef, useState } from "react";
import { KING_TRAITS, loadAvatarKing, OPTION_NAMES, randomTraits, TRAIT_NAMES, TRAIT_OPTIONS, traitsFrom, type Emote, type KingAvatar, type Trait, type Traits } from "@paved/renderer";
import { Button } from "../../components/ui/button";
import { AVATAR_BACKDROP, AvatarStill } from "../../components/elements/avatar-still";

/**
 * The avatar (AVATAR-LIVING, `@paved/renderer`'s `avatar-king.ts`): the king and his traits, living (the idle, a blink, the
 * emotes, the head following the cursor on a desktop) and as the menus' stills. The app shows it in the home's badge and the
 * creator (`Scenes/AvatarCreator`); these stories try every trait and emote. Each live bust is a WebGL context of its own.
 */
const meta = {
  title: "Avatar/King",
  parameters: { layout: "fullscreen", reducedMotion: "never" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const EMOTE_LIST: Emote[] = ["wave", "cheer", "dance", "think", "sad", "clap"];

/** A live bust in a circle on the village, `size` px at most (it shrinks with a narrow screen); `onReady` hands it out. */
function KingBust({ size, traits, onReady }: { size: number; traits?: Partial<Traits>; onReady?: (k: KingAvatar) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const king = useRef<KingAvatar | null>(null);
  const first = useRef(traits);
  useEffect(() => {
    let gone = false;
    void loadAvatarKing().then((m) => {
      if (gone || !ref.current) return;
      // Checks: the traits from the URL (?traits=hair-blond.beard-none), over the props'.
      const q = new URLSearchParams(window.location.search);
      king.current = new m.KingAvatar(ref.current, { backdrop: AVATAR_BACKDROP, traits: q.has("traits") ? traitsFrom(q.get("traits")) : first.current });
      onReady?.(king.current);
    });
    return () => {
      gone = true;
      king.current?.dispose();
      king.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- built once; the traits follow below
  }, []);
  useEffect(() => king.current?.setTraits(traits ?? {}), [traits]);
  return <div data-slot="king" ref={ref} style={{ width: size, maxWidth: "100%", aspectRatio: "1", borderRadius: "50%", overflow: "hidden" }} />;
}

function TraitsPlayground() {
  const [traits, setTraits] = useState<Traits>(KING_TRAITS);
  const [king, setKing] = useState<KingAvatar | null>(null);
  return (
    <div style={{ display: "flex", gap: 24, padding: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
      <KingBust size={360} traits={traits} onReady={setKing} />
      <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "8px 12px", alignItems: "center", fontSize: 14 }}>
        {(Object.keys(TRAIT_OPTIONS) as Trait[]).map((key) => (
          <label key={key} style={{ display: "contents" }}>
            <span>{TRAIT_NAMES[key]}</span>
            <select value={traits[key]} onChange={(e) => setTraits({ ...traits, [key]: e.target.value })}>
              {TRAIT_OPTIONS[key].map((v) => (
                <option key={v} value={v}>
                  {(OPTION_NAMES[key] as Record<string, string>)[v]}
                </option>
              ))}
            </select>
          </label>
        ))}
        <span />
        <div style={{ display: "flex", gap: 8 }}>
          <Button size="sm" onClick={() => setTraits(randomTraits())}>
            Random
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setTraits(KING_TRAITS)}>
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

/** A picker per trait, a random draw, the emotes on the buttons; on a desktop the head follows the cursor. */
export const Traits_: Story = { name: "Traits", render: () => <TraitsPlayground /> };

/** Eight characters drawn from the traits. */
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

/** Calls `then` once the frame after the next has started: a bust built now has drawn its first frame by then. */
const afterFirstFrame = (then: () => void) => requestAnimationFrame(() => requestAnimationFrame(then));

/** Whether the element has come into the viewport (once in, it stays true). */
function useSeen(ref: RefObject<HTMLElement | null>): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen || !ref.current) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setSeen(true));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref, seen]);
  return seen;
}

/** A bust's place: the bust once it is its turn and in view, before that an empty disc of its size. */
function CastSlot({ traits, turn, onReady }: { traits: Partial<Traits>; turn: boolean; onReady: (k: KingAvatar) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeen(ref);
  if (turn && seen) return <KingBust size={220} traits={traits} onReady={onReady} />;
  return <div ref={ref} style={{ width: 220, maxWidth: "100%", aspectRatio: "1", borderRadius: "50%", background: "#3a3f4a" }} />;
}

/**
 * The busts come one at a time, each once the one before has drawn its first frame, and only on screen: eight contexts
 * compiling their shaders in one frame held software WebGL for over a minute (the wrap sweep's runners), with no frame between.
 */
function CastAll() {
  const kings = useRef<(KingAvatar | null)[]>([]);
  const [turns, setTurns] = useState(1);
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
          <CastSlot
            key={i}
            traits={t}
            turn={i < turns}
            onReady={(k) => {
              kings.current[i] = k;
              afterFirstFrame(() => setTurns((n) => Math.max(n, i + 2)));
            }}
          />
        ))}
      </div>
    </div>
  );
}

export const Cast: Story = { render: () => <CastAll /> };

/** The menus' stills (one shared context, cached): the cast at the sizes the menus draw, 44, 64 and 144 px. */
export const Stills: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 16, padding: 16 }}>
      {[44, 64, 144].map((size) => (
        <div key={size} style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {CAST_TRAITS.map((t, i) => (
            <AvatarStill key={i} traits={{ ...KING_TRAITS, ...t }} size={size} />
          ))}
        </div>
      ))}
    </div>
  ),
};
