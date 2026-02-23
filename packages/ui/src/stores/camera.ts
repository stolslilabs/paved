import { create } from "zustand";

interface CameraState {
  position: [number, number, number];
  rotation: [number, number, number];
  zoom: number;
  aspect: number;
  near: number;
  far: number;
  compassRotation: number;
  reset: boolean;
  setPosition: (position: [number, number, number]) => void;
  setRotation: (rotation: [number, number, number]) => void;
  setZoom: (zoom: number) => void;
  setAspect: (aspect: number) => void;
  setCompassRotation: (compassRotation: number) => void;
  setReset: (reset: boolean) => void;
  resetAll: () => void;
  resetButPosition: () => void;
  resetCompassRotation: () => void;
}

const DEFAULTS = {
  position: [0, 0, 0] as [number, number, number],
  rotation: [Math.PI / 2, 0, 0] as [number, number, number],
  zoom: 5,
  aspect: 1.77,
  near: 1,
  far: 2000,
  compassRotation: 0,
  reset: false,
};

export const useCameraStore = create<CameraState>((set) => ({
  ...DEFAULTS,
  setPosition: (position) => set({ position }),
  setRotation: (rotation) => set({ rotation }),
  setZoom: (zoom) => set({ zoom }),
  setAspect: (aspect) => set({ aspect }),
  setCompassRotation: (compassRotation) => set({ compassRotation }),
  setReset: (reset) => set({ reset }),
  resetAll: () => set({ ...DEFAULTS }),
  resetButPosition: () =>
    set({
      rotation: DEFAULTS.rotation,
      zoom: DEFAULTS.zoom,
      aspect: DEFAULTS.aspect,
      near: DEFAULTS.near,
      far: DEFAULTS.far,
      compassRotation: DEFAULTS.compassRotation,
      reset: false,
    }),
  resetCompassRotation: () => set({ compassRotation: 0 }),
}));
