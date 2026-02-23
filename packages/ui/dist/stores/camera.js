import { create } from "zustand";
const DEFAULTS = {
    position: [0, 0, 0],
    rotation: [Math.PI / 2, 0, 0],
    zoom: 5,
    aspect: 1.77,
    near: 1,
    far: 2000,
    compassRotation: 0,
    reset: false,
};
export const useCameraStore = create((set) => ({
    ...DEFAULTS,
    setPosition: (position) => set({ position }),
    setRotation: (rotation) => set({ rotation }),
    setZoom: (zoom) => set({ zoom }),
    setAspect: (aspect) => set({ aspect }),
    setCompassRotation: (compassRotation) => set({ compassRotation }),
    setReset: (reset) => set({ reset }),
    resetAll: () => set({ ...DEFAULTS }),
    resetButPosition: () => set({
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
//# sourceMappingURL=camera.js.map