import { provideManifest } from "@paved/renderer";
import { RENDERER_ASSETS, manifestBody } from "../data/renderer-manifest";
import VillageLayoutCanvas from "../components/containers/village-layout-canvas";

/**
 * The home's 3D village (#753), its own chunk: the renderer reads the manifest the route asked for with this code
 * (`data/renderer-manifest.ts`), as the boards do. The home's overlays paint before it, over a placeholder sky.
 */
provideManifest(RENDERER_ASSETS, manifestBody(RENDERER_ASSETS));

export default VillageLayoutCanvas;
