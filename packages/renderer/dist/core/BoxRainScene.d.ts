export declare class BoxRainScene {
    private scene;
    private camera;
    private renderer;
    private boxes;
    private assets;
    private animationId;
    constructor();
    init(canvas: HTMLCanvasElement, basePath?: string): Promise<void>;
    start(): void;
    stop(): void;
    resize(width: number, height: number): void;
    dispose(): void;
}
//# sourceMappingURL=BoxRainScene.d.ts.map