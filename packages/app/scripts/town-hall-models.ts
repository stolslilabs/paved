/**
 * TOWN-HALL: writes the Town Hall's models, the four quadrants of each of its 10 levels, from the base tiles they are built on.
 *
 *   node scripts/town-hall-models.ts [--check] [--preview <dir>]
 *
 * Reads `asset-sources/models/<plan>.glb` of the four plans the Town Hall is made of (`town-hall/model.ts`) and writes
 * `asset-sources/models/townhall/<plan>_TH_<n>.glb` (`n` the level, plus 10 for the second quadrant of a plan): a tile model as the others are (one node, one mesh, 40 x 40 columns,
 * the base palette with the hall's few colours on entries it leaves unused), in its plan's own frame, so the renderer turns it
 * as it turns that plan. Run `scripts/compress-models.ts` after it for the shipped copies. `--check` writes nothing and fails
 * when a committed model is not what this run would write; `--preview` also writes a top view and two side views a level.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { EXTRA_ENTRIES, QUADRANTS, TOWN_HALL_LEVELS, quadrant, townHall } from "./town-hall/model.ts";
import { readPng, writePng } from "./town-hall/png.ts";
import { preview } from "./town-hall/preview.ts";
import { type Grid, HEIGHT_OF_SOURCES, meshOf, readVoxels } from "./town-hall/voxels.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(HERE, "../asset-sources/models");
const OUT = join(SOURCE, "townhall");
const check = process.argv.includes("--check");
const previewDir = process.argv.includes("--preview") ? process.argv[process.argv.indexOf("--preview") + 1] : undefined;

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression]).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const tiles: Record<string, Grid> = {};
let palette: Uint8Array | undefined;
for (const q of QUADRANTS) {
  const doc = await io.read(join(SOURCE, `${q.plan}.glb`));
  tiles[q.plan] = readVoxels(doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!, HEIGHT_OF_SOURCES);
  palette ??= readPng(doc.getRoot().listTextures()[0]!.getImage()!).rgb;
}
// The patterns copied from other base tiles: the gate of `cccccfrfc`, the houses of the city tiles.
const voxelsOf = async (plan: string) => readVoxels((await io.read(join(SOURCE, `${plan}.glb`))).getRoot().listMeshes()[0]!.listPrimitives()[0]!, HEIGHT_OF_SOURCES);
const patterns = { gate: await voxelsOf("cccccfrfc"), cities: await Promise.all(["ccccccccc", "cccccfffc", "cccccfrfc", "cfffcfffc", "ffffcccff"].map(voxelsOf)) };
for (const [entry, hex] of Object.entries(EXTRA_ENTRIES)) for (let k = 0; k < 3; k++) palette![Number(entry) * 3 + k] = parseInt(hex.slice(1 + 2 * k, 3 + 2 * k), 16);
const image = writePng(256, 1, palette!);

if (!check) mkdirSync(OUT, { recursive: true });
let stale = 0;
const written = new Set<string>();
for (let level = 1; level <= TOWN_HALL_LEVELS; level++) {
  const grid = townHall(level, tiles, patterns);
  if (previewDir) {
    mkdirSync(previewDir, { recursive: true });
    preview(grid, palette!, join(previewDir, `th${level}-top.png`), { top: true });
    preview(grid, palette!, join(previewDir, `th${level}-south.png`));
    preview(grid, palette!, join(previewDir, `th${level}-north.png`), { from: "n" });
  }
  for (const q of QUADRANTS) {
    // The base model's document, its mesh and palette replaced: the node, the material and the sampler stay the tiles' own.
    const doc = await io.read(join(SOURCE, `${q.plan}.glb`));
    const root = doc.getRoot();
    const prim = root.listMeshes()[0]!.listPrimitives()[0]!;
    const mesh = meshOf(quadrant(grid, q.id));
    const buffer = root.listBuffers()[0]!;
    for (const semantic of prim.listSemantics()) prim.getAttribute(semantic)!.dispose();
    prim.getIndices()!.dispose();
    prim.setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(mesh.positions).setBuffer(buffer));
    prim.setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(mesh.normals).setBuffer(buffer));
    prim.setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(mesh.uvs).setBuffer(buffer));
    prim.setIndices(doc.createAccessor().setType("SCALAR").setArray(mesh.indices).setBuffer(buffer));
    root.listTextures()[0]!.setImage(image).setMimeType("image/png");
    const name = `${q.plan}_TH_${level + TOWN_HALL_LEVELS * q.set}`;
    // Stored with meshopt's codecs, lossless on these float attributes: a tenth of the plain file.
    doc.createExtension(EXTMeshoptCompression).setRequired(true);
    root.listNodes()[0]!.setName(name);
    root.listMeshes()[0]!.setName(name);
    const bytes = await io.writeBinary(doc);
    const file = join(OUT, `${name}.glb`);
    written.add(`${name}.glb`);
    if (check) {
      if (!existsSync(file) || !readFileSync(file).equals(Buffer.from(bytes))) {
        console.error(`stale: ${name}.glb`);
        stale++;
      }
    } else writeFileSync(file, bytes);
  }
  console.log(`level ${level}: ${grid.top()} voxels high`);
}
// A model of an earlier run that this one does not write (another plan under a cell) goes.
for (const name of existsSync(OUT) ? readdirSync(OUT) : []) {
  if (written.has(name) || !name.endsWith(".glb")) continue;
  if (check) {
    console.error(`left over: ${name}`);
    stale++;
  } else unlinkSync(join(OUT, name));
}
if (stale) {
  console.error(`${stale} Town Hall model(s) differ from this run: node scripts/town-hall-models.ts`);
  process.exit(1);
}
