import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LiveMusicPlayer, MusicPlayer } from "./music-player";
import { AudioProvider } from "./audio-provider";
import { DEFAULT_SETTINGS } from "../../data/settings";
import { artOf } from "../../lib/music/track-info";
import { STORY_TRACKS } from "../../mocks/music";

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

export const Playing: Story = {};
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
/** A title longer than the row: it is cut with an ellipsis. */
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
