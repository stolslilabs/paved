import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MusicPlayerControls } from "./music-player";
import { AudioProvider, useMusic } from "./audio-provider";
import { DEFAULT_SETTINGS } from "../../data/settings";
import { STORY_TRACKS } from "../../mocks/music";

const meta = {
  title: "Containers/MusicPlayer",
  component: MusicPlayerControls,
  parameters: { layout: "padded" },
  args: { title: "Whispers of the Court", position: 72, duration: 183, enabled: true, playing: true, volume: 0.4, onEnabledChange: fn(), onVolumeChange: fn(), onSkip: fn() },
  decorators: [(Story) => <div className="max-w-sm"><Story /></div>],
} satisfies Meta<typeof MusicPlayerControls>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playing: Story = {};
/** On, but silent: the page has had no click or key yet (the browser's autoplay rule), or the tab is hidden. */
export const Waiting: Story = { args: { playing: false, title: null, position: 0, duration: 0 } };
export const Off: Story = { args: { enabled: false, playing: false } };

function Controls({ enabled, volume, onEnabledChange, onVolumeChange }: { enabled: boolean; volume: number; onEnabledChange: (v: boolean) => void; onVolumeChange: (v: number) => void }) {
  const m = useMusic();
  return <MusicPlayerControls title={m.title} position={m.position} duration={m.duration} enabled={enabled} playing={m.playing} volume={volume} onEnabledChange={onEnabledChange} onVolumeChange={onVolumeChange} onSkip={m.skip} />;
}

function Live_() {
  const [volume, setVolume] = useState(DEFAULT_SETTINGS.musicVolume);
  const [on, setOn] = useState(true);
  // The player's play button is the mute: off is a volume of 0.
  return (
    <AudioProvider musicVolume={on ? volume : 0} sfxVolume={DEFAULT_SETTINGS.sfxVolume} tracks={STORY_TRACKS}>
      <Controls enabled={on && volume > 0} volume={volume} onEnabledChange={setOn} onVolumeChange={setVolume} />
    </AudioProvider>
  );
}

/**
 * The real player (two tracks of `public/music/`, streamed: the Storybook carries only these; the shuffle, the 2 s crossfade, paused while the tab is
 * hidden). Nothing loads until you click or press a key; "Next track" jumps to the crossfade.
 */
export const Live: Story = { render: () => <Live_ /> };
