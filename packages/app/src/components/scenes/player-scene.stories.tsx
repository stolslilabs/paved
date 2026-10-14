import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PLAYER_PAGE } from "../../mocks/scenes";
import { PlayerScene } from "./player-scene";
import { at } from "./viewports";

/** A player's page (`/player/:id`, under Ranks): who, today's rank, their record, their last games. Each state at the four viewports. */
const meta = { title: "Scenes/Player", component: PlayerScene, args: { onBack: fn(), onNavigate: fn() } } satisfies Meta<typeof PlayerScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Another player, opened from a row: today's leader. */
const other: Story = { args: PLAYER_PAGE.other };
export const OtherMobile: Story = at("mobile", other);
export const OtherTablet: Story = at("tablet", other);
export const OtherDesktop: Story = at("desktop", other);
export const OtherWide: Story = at("wide", other);

/** The viewer's own page, with a game running. */
const self: Story = { args: PLAYER_PAGE.self };
export const SelfMobile: Story = at("mobile", self);
export const SelfTablet: Story = at("tablet", self);
export const SelfDesktop: Story = at("desktop", self);
export const SelfWide: Story = at("wide", self);

/** An address the indexer has never seen. */
const unknown: Story = { args: PLAYER_PAGE.unknown };
export const UnknownMobile: Story = at("mobile", unknown);
export const UnknownTablet: Story = at("tablet", unknown);
export const UnknownDesktop: Story = at("desktop", unknown);
export const UnknownWide: Story = at("wide", unknown);

/** The profile and the games on their way. */
const loading: Story = { args: PLAYER_PAGE.loading };
export const LoadingMobile: Story = at("mobile", loading);
export const LoadingTablet: Story = at("tablet", loading);
export const LoadingDesktop: Story = at("desktop", loading);
export const LoadingWide: Story = at("wide", loading);
