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
export declare const useCameraStore: import("zustand").UseBoundStore<import("zustand").StoreApi<CameraState>>;
export {};
//# sourceMappingURL=camera.d.ts.map