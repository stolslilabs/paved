// The village's stage (#753): the overlays paint first, the editor, the board and the engine come in their own chunk. One import for
// its three uses (the stage, the left column's hint, the Camera button), so the first load names the chunk's files once.
export const loadStage = () => import("../containers/village-stage");
