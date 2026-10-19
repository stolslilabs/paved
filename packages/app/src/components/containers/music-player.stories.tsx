import { useEffect, useState, useSyncExternalStore } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LiveMusicPlayer, MusicPlayer } from "./music-player";
import { AudioProvider } from "./audio-provider";
import { DEFAULT_SETTINGS } from "../../data/settings";
import { artOf } from "../../lib/music/track-info";
import { STORY_TRACKS } from "../../mocks/music";
import { CROSSFADE_S, createMusicPlayer, type MusicPlayer as Player } from "../../lib/music/player";
import { TRACKS } from "../../lib/music/tracks";

const TRACK = "/music/09-whispers-of-the-court.m4a";

const meta = {
  title: "Containers/MusicPlayer",
  component: MusicPlayer,
  parameters: { layout: "padded" },
  args: {
    track: TRACK,
    title: "Whispers of the Court",
    art: artOf(TRACK, 128),
    position: 72,
    duration: 183,
    enabled: true,
    unlocked: true,
    playing: true,
    loading: false,
    onPrevious: fn(),
    onNext: fn(),
    onPlay: fn(),
    onPause: fn(),
  },
} satisfies Meta<typeof MusicPlayer>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The compact card (#580): the controls on the thumbnail's row, next to the title; the progress and the time across under it. */
export const Playing: Story = {};
/** On a phone (the `mobile` viewport, 360 px): the title wraps between the thumbnail and the controls, the card keeps its two rows. */
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
/** The real title, with its apostrophe: the file name reads "the-rivers-path". */
export const RealTitle: Story = { args: { track: "/music/04-the-rivers-path.m4a", title: "The River's Path", art: artOf("/music/04-the-rivers-path.m4a", 128), position: 12, duration: 201 } };
/** Before the first gesture: nothing may play until a tap (the browser's autoplay rule); Play is that tap. */
export const BeforeFirstGesture: Story = { args: { track: null, title: null, art: null, unlocked: false, playing: false, position: 0, duration: 0 } };
/** The music volume at 0: Play turns it back on, Previous and Next still change the track. */
export const Muted: Story = { args: { enabled: false, playing: false } };
/** A new track whose data has not arrived: a spinner over the thumbnail. */
export const Loading: Story = { args: { track: "/music/03-market-day.m4a", title: "Market Day", art: artOf("/music/03-market-day.m4a", 128), position: 0, duration: 0, playing: false, loading: true } };
/** The image does not load: a neutral placeholder. */
export const ImageFailed: Story = { args: { art: "/music-art/128/missing.webp" } };
/** A title longer than the row: it wraps, whole. */
export const LongTitle: Story = { args: { title: "Secrets of the Old Kingdom, the extended version for a very long evening" } };

function Live_() {
  const [volume, setVolume] = useState(DEFAULT_SETTINGS.musicVolume);
  const [before, setBefore] = useState(DEFAULT_SETTINGS.musicBefore);
  return (
    <AudioProvider
      musicVolume={volume}
      musicBefore={before}
      sfxVolume={DEFAULT_SETTINGS.sfxVolume}
      tracks={STORY_TRACKS}
      onMusicVolumeChange={(v) => {
        if (v > 0) setBefore(v);
        setVolume(v);
      }}
    >
      <LiveMusicPlayer enabled={volume > 0} />
    </AudioProvider>
  );
}

/**
 * The real player (two tracks of `public/music/`, streamed: the Storybook carries only these; the shuffle, the 2 s crossfade,
 * paused while the tab is hidden). Nothing loads until you click or press a key; Next and Previous crossfade, Pause mutes.
 */
export const Live: Story = { render: () => <Live_ /> };

/**
 * An `<audio>` element with no sound and no network, on a clock of its own: it plays a track of `length` seconds, and its
 * length is known `metadataMs` after its source is set (as a real one's, after the metadata loads).
 */
class SimulatedAudio extends EventTarget {
  preload = "";
  loop = false;
  volume = 1;
  paused = true;
  ended = false;
  readyState = 4;
  private at = 0;
  private since = 0;
  private known = false;
  private source = "";
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private readonly length: number,
    private readonly metadataMs: number,
  ) {
    super();
  }
  get src() {
    return this.source;
  }
  set src(v: string) {
    this.source = v;
    this.at = 0;
    this.since = performance.now();
    this.known = false;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.known = true;
      this.dispatchEvent(new Event("durationchange"));
    }, this.metadataMs);
  }
  get duration() {
    return this.known ? this.length : NaN;
  }
  get currentTime() {
    const t = this.paused ? this.at : this.at + (performance.now() - this.since) / 1000;
    return Math.min(t, this.length);
  }
  set currentTime(t: number) {
    this.at = t;
    this.since = performance.now();
  }
  play() {
    if (this.paused) {
      this.since = performance.now();
      this.paused = false;
    }
    return Promise.resolve();
  }
  pause() {
    if (!this.paused) this.at = this.currentTime;
    this.paused = true;
  }
  load() {}
  removeAttribute(name: string) {
    if (name === "src") this.source = "";
  }
}

/** The player's real state machine (shuffle, history, the 2 s crossfade) on simulated elements: tracks of 40 s, no sound. */
function Switch_({ autoNext }: { autoNext: boolean }) {
  const [player] = useState<Player>(() =>
    createMusicPlayer({ tracks: TRACKS, enabled: true, volume: 0.5, createAudio: () => new SimulatedAudio(40, 400) as unknown as HTMLAudioElement }),
  );
  const s = useSyncExternalStore(player.subscribe, player.getState);
  useEffect(() => {
    // The first gesture, as a tap would be; then, for the capture, Next once the first track is under way.
    document.dispatchEvent(new Event("pointerdown"));
    const next = autoNext ? setTimeout(() => player.skip(), 1500) : undefined;
    return () => {
      clearTimeout(next);
      player.destroy();
    };
  }, [player, autoNext]);
  // Both elements sound during a crossfade: the outgoing one runs out its last seconds while the card shows the new track.
  const [a, b] = player.elements;
  const fading = !a.paused && !b.paused;
  const out = fading ? (a.currentTime > b.currentTime ? a : b) : null;
  return (
    <div className="flex flex-col gap-2">
      <MusicPlayer
        track={s.track}
        title={s.title}
        art={s.track ? artOf(s.track, 128) : null}
        position={s.position}
        duration={s.duration}
        enabled={s.enabled}
        unlocked={s.unlocked}
        playing={s.playing}
        loading={s.loading}
        onPrevious={() => player.previous()}
        onNext={() => player.skip()}
        onPlay={() => player.resume()}
        onPause={() => player.pause()}
      />
      <p className="text-xs text-muted-foreground" data-testid="music-crossfade">
        {out ? `Crossfading: the old track has ${Math.max(0, out.duration - out.currentTime).toFixed(1)} s of its ${CROSSFADE_S} s left` : "No crossfade"}
      </p>
    </div>
  );
}

/**
 * Next mid-crossfade (#580), on the real player with simulated tracks: 1.5 s in, Next. The card shows the new track at once, at
 * 0:00 (its length a moment later, once known), while the old one fades out under it for 2 s; it never runs to the old track's
 * end. Press Next or Previous to see it again.
 */
export const SwitchMidCrossfade: Story = { render: () => <Switch_ autoNext /> };
/** The same player, Next and Previous by hand. */
export const SwitchByHand: Story = { render: () => <Switch_ autoNext={false} /> };
