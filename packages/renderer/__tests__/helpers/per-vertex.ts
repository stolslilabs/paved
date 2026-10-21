import * as THREE from "three";
import { BASE_PALETTE_CLASSES, labelTileColumns, type PaletteClasses, type TileColumns } from "../../src/core/features";
import { planLayout } from "../../src/core/feature-layout";

/** A model's labels per column (`labelTileColumns`), and per vertex. */
export interface TileLabels extends TileColumns {
  readonly feature: Uint8Array;
  readonly area: Uint8Array;
}

/**
 * The labels of a tile model's mesh per column, and per vertex as the first renderer drew them: the label of the column
 * its triangles stand on (a triangle's centre stepped half a voxel inward along its normal), a vertex shared by
 * triangles of different columns taking the label covering most of their area. A merged face over columns of two labels
 * cannot show both through its vertices (the voxels cut on their diagonal): the tests measure that against the label map
 * the shader reads per fragment.
 */
export function labelTileGeometry(geometry: THREE.BufferGeometry, planKey: string, toModel = new THREE.Matrix4(), classes: PaletteClasses = BASE_PALETTE_CLASSES): TileLabels {
  const { columns, grid } = labelTileColumns(geometry, planLayout(planKey), toModel, classes);
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex()!.array;
  const weights: Map<number, number>[] = Array.from({ length: position.count }, () => new Map());
  const [a, b, c, n] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let t = 0; t + 2 < index.length; t += 3) {
    const ids = [index[t], index[t + 1], index[t + 2]];
    a.fromBufferAttribute(position, ids[0]).applyMatrix4(toModel);
    b.fromBufferAttribute(position, ids[1]).applyMatrix4(toModel);
    c.fromBufferAttribute(position, ids[2]).applyMatrix4(toModel);
    n.crossVectors(new THREE.Vector3().subVectors(b, a), new THREE.Vector3().subVectors(c, a));
    const twiceArea = n.length();
    if (twiceArea === 0) continue;
    n.divideScalar(twiceArea);
    const centre = a.add(b).add(c).divideScalar(3).addScaledVector(n, -grid.cell / 2);
    const i = Math.min(columns.size - 1, Math.max(0, Math.floor((centre.x - grid.minX) / grid.cell)));
    const j = Math.min(columns.size - 1, Math.max(0, Math.floor((centre.z - grid.minZ) / grid.cell)));
    const key = columns.feature[j * columns.size + i] * 16 + columns.area[j * columns.size + i];
    for (const id of ids) weights[id].set(key, (weights[id].get(key) ?? 0) + twiceArea);
  }
  const feature = new Uint8Array(position.count);
  const area = new Uint8Array(position.count);
  weights.forEach((byLabel, v) => {
    let [best, weight] = [0, -1];
    for (const [key, w] of byLabel) if (w > weight) [best, weight] = [key, w];
    feature[v] = best >> 4;
    area[v] = best & 15;
  });
  return { feature, area, columns, grid };
}
