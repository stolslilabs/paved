import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { CategoryType, Plan, PlanType, SpotType, StructureBoard } from "@paved/game-core";
import { FEATURE_CODE, labelTileGeometry, planKeyOfModel, type TileLabels } from "../src/core/features";
import { FEATURE_HIGHLIGHT_GLSL, TileRenderer } from "../src/core/TileRenderer";
import { LOOK_PRESETS } from "../src/core/look";

const MODELS = fileURLToPath(new URL("../../app-web/public/models", import.meta.url));
const KEYS = readdirSync(MODELS)
  .filter((f) => f.endsWith(".glb"))
  .map((f) => f.slice(0, -4));

/**
 * A base tile model (GLB) as the loader gives it, without a loader: its one mesh (position, normal, uv, index) under its
 * node's rotation (Z up in the file, Y up in the scene), in a group.
 */
function readTileModel(key: string): THREE.Group {
  const glb = readFileSync(`${MODELS}/${key}.glb`);
  const jsonLength = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString());
  const bin = 20 + jsonLength + 8;
  const read = (index: number, Type: Float32ArrayConstructor | Uint32ArrayConstructor | Uint16ArrayConstructor, size: number) => {
    const accessor = gltf.accessors[index];
    const view = gltf.bufferViews[accessor.bufferView];
    const start = glb.byteOffset + bin + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return new Type(glb.buffer.slice(start, start + accessor.count * size * Type.BYTES_PER_ELEMENT));
  };
  const primitive = gltf.meshes[0].primitives[0];
  const indexType = gltf.accessors[primitive.indices].componentType === 5125 ? Uint32Array : Uint16Array;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(read(primitive.attributes.POSITION, Float32Array, 3), 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(read(primitive.attributes.NORMAL, Float32Array, 3), 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(read(primitive.attributes.TEXCOORD_0, Float32Array, 2), 2));
  geometry.setIndex(new THREE.BufferAttribute(read(primitive.indices, indexType, 1), 1));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  const [x, y, z, w] = gltf.nodes[0].rotation ?? [0, 0, 0, 1];
  mesh.quaternion.set(x, y, z, w);
  const group = new THREE.Group();
  group.add(mesh);
  group.updateMatrixWorld(true);
  return group;
}

const meshOf = (model: THREE.Group) => model.children[0] as THREE.Mesh;

/** The area codes of a plan's spots of one category, from the layout (`@paved/game-core`). */
function planAreas(key: string, category: CategoryType): Set<number> {
  const plan = new Plan(key.toUpperCase() as PlanType);
  const spots = [SpotType.Center, SpotType.NorthWest, SpotType.North, SpotType.NorthEast, SpotType.East, SpotType.SouthEast, SpotType.South, SpotType.SouthWest, SpotType.West];
  const categories = plan.unpack().map((c) => c.value);
  return new Set(spots.filter((_, i) => categories[i] === category).map((spot) => " ABCDEFGHI".indexOf(plan.area(spot))));
}

/** The area codes the columns of one feature carry. */
const columnAreas = (labels: TileLabels, feature: number) =>
  new Set(Array.from(labels.columns.area).filter((_, k) => labels.columns.feature[k] === feature));

const labelled = new Map<string, TileLabels>();
const timings: number[] = [];
for (const key of KEYS) {
  const mesh = meshOf(readTileModel(key));
  const start = performance.now();
  labelled.set(key, labelTileGeometry(mesh.geometry, key, mesh.matrixWorld));
  timings.push(performance.now() - start);
}

/** A TileRenderer over a fake loader that serves the real base models (their geometry shared, their materials copied). */
function renderer(): { tiles: TileRenderer; models: Map<string, THREE.Group> } {
  const models = new Map(KEYS.map((key) => [key, readTileModel(key)]));
  const assets = {
    has: (key: string) => models.has(key),
    want: () => {},
    setSkins: () => {},
    getModel: (key: string) => {
      const model = models.get(key)!.clone(true);
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) child.material = (child.material as THREE.Material).clone();
      });
      return model;
    },
  };
  return { tiles: new TileRenderer(assets as never), models };
}

const featureOn = { ...LOOK_PRESETS.mockup.featureHighlight, enabled: true };
const lightUp = (tiles: TileRenderer, featureHighlight = featureOn) =>
  tiles.setLook(LOOK_PRESETS.mockup.highlights, LOOK_PRESETS.mockup.water, featureHighlight);

/** A tile material's shader as the patch writes it, and its uniforms (the shared ones and the geometry's own). */
function shaderOf(material: THREE.Material) {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  (material as THREE.MeshStandardMaterial).onBeforeCompile(shader as never, {} as never);
  return shader as { uniforms: Record<string, { value: any }>; vertexShader: string; fragmentShader: string };
}

/** The model of a plan type as the renderer drew it (its tuned materials), and its mesh. */
function typeMesh(tiles: TileRenderer, key: string): THREE.Mesh {
  const type = (tiles as any).tileTypes.get(key) as THREE.Group;
  type.updateMatrixWorld(true);
  return type.children[0] as THREE.Mesh;
}

/**
 * The label the tile shader reads for a fragment (`FEATURE_HIGHLIGHT_GLSL`), in TypeScript: the fragment's place on the
 * grid (`uGridMatrix`), half a voxel inward along its face's normal, its column's byte in the label map.
 */
function fragmentLabel(uniforms: Record<string, { value: any }>, point: THREE.Vector3, normal: THREE.Vector3): { feature: number; area: number } {
  const grid = uniforms.uGridMatrix.value as THREE.Matrix4;
  const { width, height, data } = (uniforms.uLabelMap.value as THREE.DataTexture).image as { width: number; height: number; data: Uint8Array };
  const n = normal.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(grid)).normalize();
  const at = point.clone().applyMatrix4(grid).addScaledVector(n, -0.5);
  const i = Math.min(width - 1, Math.max(0, Math.floor(at.x)));
  const j = Math.min(height - 1, Math.max(0, Math.floor(at.z)));
  const label = data[j * width + i];
  return { feature: label >> 4, area: label & 15 };
}

describe("the voxels' features (labelTileGeometry) over the 19 base models", () => {
  it("reads the 19 base models", () => {
    expect(KEYS).toHaveLength(19);
  });

  it("finds each city of a plan, one area per city: two in ffcfffcff, none on a plan without one", () => {
    const counts: Record<string, number> = {};
    for (const key of KEYS) {
      const found = columnAreas(labelled.get(key)!, FEATURE_CODE.city);
      expect(found, key).toEqual(planAreas(key, CategoryType.City));
      counts[key] = found.size;
    }
    expect(counts.ffcfffcff).toBe(2);
    expect(Object.entries(counts).filter(([key, n]) => key.includes("c") && n === 0)).toEqual([]);
    expect(Object.values(counts).filter((n) => n > 0)).toHaveLength(13);
  });

  it("finds each road of a plan, and a wonder only on the wonder plans", () => {
    for (const key of KEYS) {
      const labels = labelled.get(key)!;
      expect(columnAreas(labels, FEATURE_CODE.road), key).toEqual(planAreas(key, CategoryType.Road));
      expect(columnAreas(labels, FEATURE_CODE.wonder), key).toEqual(planAreas(key, CategoryType.Wonder));
    }
  });

  it("gives every forest column one of the plan's forest areas, and leaves no column of a full model unlabelled", () => {
    for (const key of KEYS) {
      const labels = labelled.get(key)!;
      for (const area of columnAreas(labels, FEATURE_CODE.forest)) expect(planAreas(key, CategoryType.Forest).has(area), key).toBe(true);
      expect(Array.from(labels.columns.feature).filter((f) => f === FEATURE_CODE.none), key).toEqual([]);
    }
    // The full city is all city.
    expect(new Set(labelled.get("ccccccccc")!.columns.feature)).toEqual(new Set([FEATURE_CODE.city]));
  });

  it("gives each vertex the label of the column its triangles stand on", () => {
    for (const key of KEYS) {
      const labels = labelled.get(key)!;
      const count = meshOf(readTileModel(key)).geometry.getAttribute("position").count;
      expect(labels.feature).toHaveLength(count);
      expect(labels.area).toHaveLength(count);
      expect(labels.grid.cell).toBeCloseTo(0.1);
    }
  });

  it("labels a model in a few milliseconds", () => {
    // Recorded, not a bound on the CI's machine: the mean and the slowest model.
    const mean = timings.reduce((a, b) => a + b, 0) / timings.length;
    console.info(`[features] labelTileGeometry: mean ${mean.toFixed(1)} ms, slowest ${Math.max(...timings).toFixed(1)} ms per model`);
    expect(mean).toBeGreaterThan(0);
  });
});

describe("planKeyOfModel", () => {
  it("reads a plan key, or a variant's path, and refuses what names no plan", () => {
    expect(planKeyOfModel("rfrfcccfr")).toBe("rfrfcccfr");
    expect(planKeyOfModel("models/forest/cccccfffc_HF_1.a081baf113.glb")).toBe("cccccfffc");
    expect(planKeyOfModel("models/ccccccccc.778825054e.glb")).toBe("ccccccccc");
    expect(planKeyOfModel("00")).toBeNull();
    expect(planKeyOfModel("none")).toBeNull();
  });
});

describe("the feature highlight in the tile shader", () => {
  const tile = (plan: string, id: number) => ({ game_id: 1, id, plan: Object.values(PlanType).indexOf(plan.toUpperCase() as PlanType), orientation: 1, x: id, y: 0, worldX: id, worldZ: 0 });
  const labelMapOf = (tiles: TileRenderer, models: Map<string, THREE.Group>, key: string) =>
    (tiles as any).labelMaps.get(meshOf(models.get(key)!).geometry)?.uLabelMap.value as THREE.DataTexture | undefined;

  it("labels nothing while it is off, then the models drawn and those drawn after once it is on, once each", () => {
    const { tiles, models } = renderer();
    tiles.updateTiles([tile("rfrfcccfr", 1)] as never);
    const empty = (tiles as any).emptyLabelMap;
    expect(labelMapOf(tiles, models, "rfrfcccfr")).toBe(empty);
    lightUp(tiles);
    const map = labelMapOf(tiles, models, "rfrfcccfr")!;
    expect(map).not.toBe(empty);
    expect([map.image.width, map.image.height]).toEqual([40, 40]);
    tiles.updateTiles([tile("rfrfcccfr", 1), tile("ffcfffcff", 2)] as never);
    expect(labelMapOf(tiles, models, "ffcfffcff")).not.toBe(empty);
    // Once each: turning it off and on keeps the same map.
    lightUp(tiles, LOOK_PRESETS.mockup.featureHighlight);
    lightUp(tiles);
    expect(labelMapOf(tiles, models, "rfrfcccfr")).toBe(map);
    tiles.dispose();
  });

  it("lights the chosen feature through shared uniforms, its label read per fragment, with no recompile", () => {
    const { tiles } = renderer();
    tiles.updateTiles([tile("rfrfcccfr", 1)] as never);
    const material = typeMesh(tiles, "rfrfcccfr").material as THREE.MeshStandardMaterial;
    const { uniforms, vertexShader, fragmentShader } = shaderOf(material);
    expect(material.customProgramCacheKey()).toBe("paved-tile");
    expect(vertexShader).toContain("vGrid = (uGridMatrix * vec4(position, 1.0)).xyz;");
    expect(vertexShader).toContain("vGridNormal = mat3(uGridMatrix) * normal;");
    expect(fragmentShader).toContain("texelFetch(uLabelMap, labelTexel, 0)");
    expect(fragmentShader).toContain("totalEmissiveRadiance += uFeatureColor * uFeatureGlow * featureLit;");
    // The water's patch is kept.
    expect(fragmentShader).toContain("waterMask");
    expect(uniforms.uFeatureOn.value).toBe(0);
    lightUp(tiles, { ...featureOn, feature: "road", dim: 0.3 });
    expect([uniforms.uFeatureOn.value, uniforms.uFeature.value, uniforms.uFeatureDim.value]).toEqual([1, FEATURE_CODE.road, 0.3]);
    expect((uniforms.uFeatureColor.value as THREE.Color).equals(new THREE.Color(featureOn.color))).toBe(true);
    lightUp(tiles, LOOK_PRESETS.mockup.featureHighlight);
    expect(uniforms.uFeatureOn.value).toBe(0);
    tiles.dispose();
  });

  it("reads each fragment's own column: a merged face over columns of two labels shows each on its own columns, not cut on its diagonal", () => {
    // The shader reads no label per vertex (a flat varying lit a whole triangle from its last vertex: the cut voxels).
    expect(FEATURE_HIGHLIGHT_GLSL).not.toMatch(/vFeature|vArea/);
    const { tiles } = renderer();
    lightUp(tiles);
    tiles.updateTiles(KEYS.map((key, i) => tile(key, i + 1)) as never);
    let [samples, wrong, mixed, cut] = [0, 0, 0, 0];
    const [a, b, c, n, point] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (const key of KEYS) {
      const mesh = typeMesh(tiles, key);
      const { uniforms } = shaderOf(mesh.material as THREE.Material);
      // The classifier's own frame and columns (computed apart from the renderer), and its labels per vertex.
      const { columns, grid, feature: perVertex } = labelled.get(key)!;
      const toModel = mesh.matrixWorld;
      const toGeometry = toModel.clone().invert();
      const position = mesh.geometry.getAttribute("position");
      const normal = mesh.geometry.getAttribute("normal");
      const index = mesh.geometry.getIndex()!.array;
      for (let t = 0; t < index.length; t += 3) {
        a.fromBufferAttribute(position, index[t]).applyMatrix4(toModel);
        b.fromBufferAttribute(position, index[t + 1]).applyMatrix4(toModel);
        c.fromBufferAttribute(position, index[t + 2]).applyMatrix4(toModel);
        if (Math.abs(a.y - b.y) > 1e-4 || Math.abs(a.y - c.y) > 1e-4) continue;
        n.fromBufferAttribute(normal, index[t + 2]);
        // Each column whose centre the face covers: a fragment there, in the geometry's space.
        const seen = new Set<number>();
        const col = (v: number, min: number) => Math.floor((v - min) / grid.cell);
        for (let j = Math.max(0, col(Math.min(a.z, b.z, c.z), grid.minZ)); j <= Math.min(39, col(Math.max(a.z, b.z, c.z), grid.minZ)); j++) {
          for (let i = Math.max(0, col(Math.min(a.x, b.x, c.x), grid.minX)); i <= Math.min(39, col(Math.max(a.x, b.x, c.x), grid.minX)); i++) {
            const [x, z] = [grid.minX + (i + 0.5) * grid.cell, grid.minZ + (j + 0.5) * grid.cell];
            const side = (p: THREE.Vector3, q: THREE.Vector3) => (q.x - p.x) * (z - p.z) - (q.z - p.z) * (x - p.x);
            const [d1, d2, d3] = [side(a, b), side(b, c), side(c, a)];
            if (!((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0))) continue;
            const expected = columns.feature[j * 40 + i];
            seen.add(expected);
            samples++;
            point.set(x, a.y, z).applyMatrix4(toGeometry);
            if (fragmentLabel(uniforms, point, n).feature !== expected) wrong++;
            if (perVertex[index[t + 2]] !== expected) cut++;
          }
        }
        if (seen.size > 1) mixed++;
      }
    }
    expect(samples).toBeGreaterThan(19 * 1000);
    expect(wrong).toBe(0);
    // Merged faces over two labels exist, and a label per vertex drew some of their columns with the other's.
    expect(mixed).toBeGreaterThan(0);
    expect(cut).toBeGreaterThan(0);
    console.info(`[features] ${samples} top columns read per fragment, ${wrong} wrong; ${mixed} merged faces over two labels, ${cut} columns a label per vertex drew wrong`);
    tiles.dispose();
  });
});

describe("one structure lit across its tiles (setLitAreas)", () => {
  const planCode = (plan: PlanType) => new Plan(plan).into();
  const areaOf = (plan: PlanType, spot: SpotType) => " ABCDEFGHI".indexOf(new Plan(plan).area(spot));
  /** A tile as the board hands it: the contracts' (x, y), the grid's cell (y grows to the north, the grid's z to the south). */
  const renderTile = (id: number, plan: PlanType, orientation: number, x: number, y: number) =>
    ({ game_id: 1, id, plan: planCode(plan), orientation, x, y, worldX: x, worldZ: -y }) as never;

  /** The tile mesh drawn for a tile key, and what its shader reads: its cell (`vCell`), its uniforms. */
  function drawn(tiles: TileRenderer, key: string) {
    tiles.getGroup().updateMatrixWorld(true);
    let mesh: THREE.Mesh | null = null;
    (tiles as any).tileMeshes.get(key).mesh.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) mesh = child;
    });
    const shader = shaderOf(mesh!.material as THREE.Material);
    // vCell = floor((modelMatrix * vec4(uFootprint, 1.0)).xz / uTileSize + 0.5)
    const centre = (shader.uniforms.uFootprint.value as THREE.Vector3).clone().applyMatrix4(mesh!.matrixWorld);
    const size = shader.uniforms.uTileSize.value as number;
    const cell = [Math.floor(centre.x / size + 0.5), Math.floor(centre.z / size + 0.5)];
    return { mesh: mesh!, uniforms: shader.uniforms, cell, shader };
  }

  /** The shader's test (FEATURE_HIGHLIGHT_GLSL) for each column of a drawn tile's label map: the areas lit and not. */
  function litAreas(tiles: TileRenderer, key: string): { lit: Set<number>; unlit: Set<number> } {
    const { uniforms, cell } = drawn(tiles, key);
    const rect = uniforms.uLitRect.value as THREE.Vector4;
    const map = uniforms.uLitMap.value as THREE.DataTexture;
    const [tx, tz] = [cell[0] - rect.x, cell[1] - rect.y];
    const inside = tx >= 0 && tz >= 0 && tx < rect.z && tz < rect.w;
    const mask = inside ? (map.image.data as Float32Array)[tz * map.image.width + tx] : 0;
    const labels = (uniforms.uLabelMap.value as THREE.DataTexture).image.data as Uint8Array;
    const [lit, unlit] = [new Set<number>(), new Set<number>()];
    for (const label of labels) {
      const area = label & 15;
      if (area) (mask >> (area - 1)) & 1 ? lit.add(area) : unlit.add(area);
    }
    return { lit, unlit };
  }

  it("lights a city across two tiles: exactly its area on each, not the other city of the first", () => {
    // ffcfffcff: a city on the north edge and one on the south; ffffffcff north of it closes the first with its south city.
    const board = new StructureBoard();
    board.place({ id: 1, plan: planCode(PlanType.FFCFFFCFF), orientation: 1, x: 0, y: 0, owner: 0n });
    const above = board.place({ id: 2, plan: planCode(PlanType.FFFFFFCFF), orientation: 1, x: 0, y: 1, owner: 0n });
    const city = board.structureOf(above, areaOf(PlanType.FFFFFFCFF, SpotType.South))!;
    const [belowNorth, belowSouth] = [areaOf(PlanType.FFCFFFCFF, SpotType.North), areaOf(PlanType.FFCFFFCFF, SpotType.South)];

    const { tiles } = renderer();
    tiles.updateTiles([renderTile(1, PlanType.FFCFFFCFF, 1, 0, 0), renderTile(2, PlanType.FFFFFFCFF, 1, 0, 1)]);
    tiles.setLitAreas([...city.areas].map(([id, areas]) => ({ gameId: 1, id, areas })));

    const below = drawn(tiles, "1-1");
    expect(below.cell).toEqual([0, 0]);
    expect(drawn(tiles, "1-2").cell).toEqual([0, -1]);
    expect([below.uniforms.uStructureOn.value, below.uniforms.uFeatureOn.value]).toEqual([1, 1]);
    expect((below.uniforms.uLitRect.value as THREE.Vector4).toArray()).toEqual([0, -1, 1, 2]);
    expect(below.shader.fragmentShader).toContain("texelFetch(uLitMap, litTexel, 0)");

    expect(litAreas(tiles, "1-1").lit).toEqual(new Set([belowNorth]));
    expect(litAreas(tiles, "1-1").unlit.has(belowSouth)).toBe(true);
    expect(litAreas(tiles, "1-2").lit).toEqual(new Set([areaOf(PlanType.FFFFFFCFF, SpotType.South)]));

    // Off: back to the look's highlight (off by default); the map empty.
    tiles.setLitAreas(null);
    expect([below.uniforms.uStructureOn.value, below.uniforms.uFeatureOn.value]).toEqual([0, 0]);
    expect((below.uniforms.uLitRect.value as THREE.Vector4).toArray()).toEqual([0, 0, 0, 0]);
    tiles.dispose();
  });

  it("finds each tile's cell from its model matrix, whatever its orientation", () => {
    const { tiles } = renderer();
    tiles.setLitAreas([]);
    tiles.updateTiles([1, 2, 3, 4].map((orientation) => renderTile(orientation, PlanType.RFRFCCCFR, orientation, 3 + orientation, -2)));
    for (const orientation of [1, 2, 3, 4]) expect(drawn(tiles, `1-${orientation}`).cell, `orientation ${orientation}`).toEqual([3 + orientation, 2]);
    tiles.dispose();
  });

  it("lights a tile given after the structure, when it comes", () => {
    const { tiles } = renderer();
    tiles.setLitAreas([{ gameId: 1, id: 7, areas: 1 }]);
    tiles.updateTiles([renderTile(7, PlanType.CCCCCCCCC, 1, 5, 5)]);
    expect(litAreas(tiles, "1-7").lit).toEqual(new Set([1]));
    tiles.dispose();
  });
});
