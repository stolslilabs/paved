import { create } from "zustand";
import { ComponentValue, Entity, Schema } from "@dojoengine/recs";
import { Howl } from "howler";
import { ModeType } from "@/dojo/game/types/mode";
import { Game } from "@/dojo/bindings/models.gen";

export const CAMERA_SETTINGS: {
  position: [number, number, number];
  rotation: [number, number, number];
  zoom: number;
  aspect: number;
  near: number;
  far: number;
  reset: boolean;
} = {
  position: [0, 0, 0],
  rotation: [Math.PI / 2, 0, 0],
  zoom: 5,
  aspect: 1.77,
  near: 1,
  far: 2000,
  reset: false,
};

export interface Tile {
  col: number;
  row: number;
}

interface ActionState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  disabled: boolean;
  setDisabled: (disabled: boolean) => void;
}

interface LobbyState {
  playerEntity: Entity | null;
  setPlayerEntity: (playerEntity: Entity) => void;
  resetPlayerEntity: () => void;
  mode: ModeType;
  setMode: (mode: ModeType) => void;
  resetMode: () => void;
  games: Array<ComponentValue<Schema, unknown>>;
  setGames: (game: ComponentValue<Schema, unknown> | undefined) => void;

}

interface CameraState {
  position: [number, number, number];
  setPosition: (position: [number, number, number]) => void;
  resetPosition: () => void;
  rotation: [number, number, number];
  setRotation: (rotation: [number, number, number]) => void;
  resetRotation: () => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  resetZoom: () => void;
  aspect: number;
  setAspect: (aspect: number) => void;
  resetAspect: () => void;
  near: number;
  setNear: (near: number) => void;
  resetNear: () => void;
  far: number;
  setFar: (far: number) => void;
  resetFar: () => void;
  reset: boolean;
  setReset: (reset: boolean) => void;
  resetAll: () => void;
  resetButPosition: () => void;
  compassRotation: number;
  setCompassRotate: (compassRotation: number) => void;
  resetCompassRotation: () => void;
}

interface GameState {
  gameId: number;
  setGameId: (gameId: number) => void;
  builderId: number;
  setBuilderId: (builderId: number) => void;
  orientation: number;
  setOrientation: (orientation: number) => void;
  resetOrientation: () => void;
  character: number;
  setCharacter: (character: number) => void;
  resetCharacter: () => void;
  spot: number;
  setSpot: (spot: number) => void;
  resetSpot: () => void;
  x: number;
  setX: (x: number) => void;
  resetX: () => void;
  y: number;
  setY: (y: number) => void;
  resetY: () => void;
  selectedTile: Tile;
  setSelectedTile: (tile: Tile) => void;
  resetSelectedTile: () => void;
  activeEntity: undefined | Entity;
  setActiveEntity: (entity: Entity | undefined) => void;
  resetActiveEntity: () => void;
  hoveredTile: Tile;
  setHoveredTile: (tile: Tile) => void;
  resetHoveredTile: () => void;
  valid: boolean;
  setValid: (valid: boolean) => void;
  resetValid: () => void;
  strategyMode: boolean;
  setStrategyMode: (strategyMode: boolean) => void;
}

export const useActionsStore = create<ActionState>((set, get) => ({
  enabled: true,
  setEnabled: (enabled) => set({ enabled }),
  disabled: false,
  setDisabled: (disabled) => set({ disabled }),
}));

export const useLobbyStore = create<LobbyState>()((set, get) => ({
  playerEntity: null,
  setPlayerEntity: (playerEntity: Entity) => set({ playerEntity }),
  resetPlayerEntity: () => set({ playerEntity: null }),
  mode: ModeType.Daily,
  setMode: (mode) => set({ mode }),
  resetMode: () => set({ mode: ModeType.Daily }),
  games: [],
  setGames: (game?: ComponentValue<Schema, unknown>) => set((state) => ({
    games: game
      ? { ...state.games, [game.id]: game }
      : state.games
  })),
}));

export const useCameraStore = create<CameraState>()((set, get) => ({
  position: CAMERA_SETTINGS.position,
  setPosition: (position) => set({ position }),
  resetPosition: () => set({ position: CAMERA_SETTINGS.position }),
  rotation: CAMERA_SETTINGS.rotation,
  setRotation: (rotation) => set({ rotation }),
  resetRotation: () => set({ rotation: CAMERA_SETTINGS.rotation }),
  zoom: CAMERA_SETTINGS.zoom,
  setZoom: (zoom) => set({ zoom }),
  resetZoom: () => set({ zoom: CAMERA_SETTINGS.zoom }),
  aspect: CAMERA_SETTINGS.aspect,
  setAspect: (aspect) => set({ aspect }),
  resetAspect: () => set({ aspect: CAMERA_SETTINGS.aspect }),
  near: CAMERA_SETTINGS.near,
  setNear: (near) => set({ near }),
  resetNear: () => set({ near: CAMERA_SETTINGS.near }),
  far: 10,
  setFar: (far) => set({ far }),
  resetFar: () => set({ far: CAMERA_SETTINGS.far }),
  reset: CAMERA_SETTINGS.reset,
  setReset: (reset) => set({ reset }),
  resetAll: () => set({ ...CAMERA_SETTINGS }),
  resetButPosition: () =>
    set({
      rotation: CAMERA_SETTINGS.rotation,
      zoom: CAMERA_SETTINGS.zoom,
    }),
  compassRotation: 0,
  setCompassRotate: (compassRotation) => set({ compassRotation }),
  resetCompassRotation: () => set({ compassRotation: 0 }),
}));

export const useGameStore = create<GameState>()((set, get) => ({
  gameId: 0,
  setGameId: (gameId) => set({ gameId }),
  builderId: 0,
  setBuilderId: (builderId) => set({ builderId }),
  orientation: 1,
  setOrientation: (orientation) => {
    // Keep orientation between 1 and 4
    if (orientation < 1) {
      orientation = 4;
    } else {
      orientation = ((orientation - 1) % 4) + 1;
    }
    set({ orientation });
  },
  resetOrientation: () => set({ orientation: 1 }),
  character: 0,
  setCharacter: (character) => set({ character }),
  resetCharacter: () => set({ character: 0 }),
  spot: 0,
  setSpot: (spot) => set({ spot }),
  resetSpot: () => set({ spot: 0 }),
  x: 0,
  setX: (x) => set({ x }),
  resetX: () => set({ x: 0 }),
  y: 0,
  setY: (y) => set({ y }),
  resetY: () => set({ y: 0 }),
  selectedTile: { col: 0, row: 0 },
  setSelectedTile: (tile) => set({ selectedTile: tile }),
  resetSelectedTile: () => set({ selectedTile: { col: 0, row: 0 } }),
  activeEntity: undefined,
  setActiveEntity: (entity) => set({ activeEntity: entity }),
  resetActiveEntity: () => set({ activeEntity: undefined }),
  hoveredTile: { col: 0, row: 0 },
  setHoveredTile: (tile) => set({ hoveredTile: tile }),
  resetHoveredTile: () => set({ hoveredTile: { col: 0, row: 0 } }),
  valid: false,
  setValid: (valid) => set({ valid }),
  resetValid: () => set({ valid: false }),
  strategyMode: true,
  setStrategyMode: (strategyMode) => set({ strategyMode }),
}));

interface UIState {
  loading: boolean;
  setLoading: (value: boolean) => void;
  takeScreenshot: (() => void) | null;
  setTakeScreenshot: (fn: () => void) => void;
}

export const useUIStore = create<UIState>((set) => ({
  loading: false,
  setLoading: (value) => set({ loading: value }),
  takeScreenshot: null,
  setTakeScreenshot: (fn) => set({ takeScreenshot: fn }),
}));

type MusicState = {
  track: Howl | null;
  setTrack: (track: Howl | null) => void;
  muted: boolean;
  setMuted: (muted: boolean) => void;
};

export const useMusicStore = create<MusicState>((set) => ({
  track: null,
  setTrack: (track) => set({ track }),
  muted: false,
  setMuted: (muted: boolean) => set({ muted }),
}));
