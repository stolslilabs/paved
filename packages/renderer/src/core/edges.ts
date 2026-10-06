import * as THREE from "three";

const PRECISION = 1e4; // EdgesGeometry's precisionPoints = 4

/**
 * Same segments, in the same order, as `new THREE.EdgesGeometry(geometry, thresholdAngle)`,
 * several times faster: vertices are welded once by their rounded position and edges are keyed
 * by number instead of by string. three's version builds six strings per triangle, which made it
 * most of the board's load time (docs/measures/client-baseline.md, "Top costs observed").
 */
export function buildEdgesGeometry(geometry: THREE.BufferGeometry, thresholdAngle = 1): THREE.BufferGeometry {
  const thresholdDot = Math.cos(THREE.MathUtils.DEG2RAD * thresholdAngle);
  const indexAttr = geometry.getIndex();
  const positionAttr = geometry.getAttribute("position");
  const vertexCount = positionAttr.count;
  const indexCount = indexAttr ? indexAttr.count : vertexCount;

  // Positions as read by fromBufferAttribute, and a weld id per vertex: two vertices share an
  // id exactly when EdgesGeometry's position hashes are equal.
  const pos = new Float64Array(vertexCount * 3);
  const quantized = new Float64Array(vertexCount * 3);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < vertexCount; v++) {
    pos[v * 3] = positionAttr.getX(v);
    pos[v * 3 + 1] = positionAttr.getY(v);
    pos[v * 3 + 2] = positionAttr.getZ(v);
    for (let k = 0; k < 3; k++) {
      const q = Math.round(pos[v * 3 + k] * PRECISION);
      quantized[v * 3 + k] = q;
      if (q < min[k]) min[k] = q;
      if (q > max[k]) max[k] = q;
    }
  }
  // A number key when the rounded box fits in a safe integer (it does for the tile models),
  // else EdgesGeometry's own string key.
  const spanY = max[1] - min[1] + 1;
  const spanZ = max[2] - min[2] + 1;
  const numeric = vertexCount === 0 || (max[0] - min[0] + 1) * spanY * spanZ <= Number.MAX_SAFE_INTEGER;
  const weld = new Int32Array(vertexCount);
  const ids = new Map<number | string, number>();
  for (let v = 0; v < vertexCount; v++) {
    const qx = quantized[v * 3];
    const qy = quantized[v * 3 + 1];
    const qz = quantized[v * 3 + 2];
    const hash = numeric ? ((qx - min[0]) * spanY + (qy - min[1])) * spanZ + (qz - min[2]) : `${qx},${qy},${qz}`;
    let id = ids.get(hash);
    if (id === undefined) {
      id = ids.size;
      ids.set(hash, id);
    }
    weld[v] = id;
  }
  const welded = ids.size;

  // Directed edge (weld id pair) -> slot; a slot holds the first triangle's edge and normal,
  // and is closed (alive 0) once its reverse edge is met, as EdgesGeometry sets it to null.
  const edgeSlots = new Map<number, number>();
  const triangleCount = Math.floor(indexCount / 3);
  const slotIndex0 = new Int32Array(triangleCount * 3);
  const slotIndex1 = new Int32Array(triangleCount * 3);
  const slotNormal = new Float64Array(triangleCount * 9);
  const slotAlive = new Uint8Array(triangleCount * 3);
  let slots = 0;

  const vertices: number[] = [];
  const idx = [0, 0, 0];
  const hid = [0, 0, 0];

  for (let i = 0; i + 2 < indexCount; i += 3) {
    if (indexAttr) {
      idx[0] = indexAttr.getX(i);
      idx[1] = indexAttr.getX(i + 1);
      idx[2] = indexAttr.getX(i + 2);
    } else {
      idx[0] = i;
      idx[1] = i + 1;
      idx[2] = i + 2;
    }
    hid[0] = weld[idx[0]];
    hid[1] = weld[idx[1]];
    hid[2] = weld[idx[2]];
    // skip degenerate triangles
    if (hid[0] === hid[1] || hid[1] === hid[2] || hid[2] === hid[0]) continue;

    // Triangle.getNormal, with the same operations in the same order
    const a = idx[0] * 3;
    const b = idx[1] * 3;
    const c = idx[2] * 3;
    const cbx = pos[c] - pos[b];
    const cby = pos[c + 1] - pos[b + 1];
    const cbz = pos[c + 2] - pos[b + 2];
    const abx = pos[a] - pos[b];
    const aby = pos[a + 1] - pos[b + 1];
    const abz = pos[a + 2] - pos[b + 2];
    let nx = cby * abz - cbz * aby;
    let ny = cbz * abx - cbx * abz;
    let nz = cbx * aby - cby * abx;
    const lengthSq = nx * nx + ny * ny + nz * nz;
    if (lengthSq > 0) {
      const inv = 1 / Math.sqrt(lengthSq);
      nx *= inv;
      ny *= inv;
      nz *= inv;
    } else {
      nx = 0;
      ny = 0;
      nz = 0;
    }

    for (let j = 0; j < 3; j++) {
      const jNext = (j + 1) % 3;
      const reverse = edgeSlots.get(hid[jNext] * welded + hid[j]);
      if (reverse !== undefined && slotAlive[reverse]) {
        const n = reverse * 3;
        if (nx * slotNormal[n] + ny * slotNormal[n + 1] + nz * slotNormal[n + 2] <= thresholdDot) {
          const v0 = idx[j] * 3;
          const v1 = idx[jNext] * 3;
          vertices.push(pos[v0], pos[v0 + 1], pos[v0 + 2], pos[v1], pos[v1 + 1], pos[v1 + 2]);
        }
        slotAlive[reverse] = 0;
      } else {
        const key = hid[j] * welded + hid[jNext];
        if (!edgeSlots.has(key)) {
          edgeSlots.set(key, slots);
          slotIndex0[slots] = idx[j];
          slotIndex1[slots] = idx[jNext];
          slotNormal[slots * 3] = nx;
          slotNormal[slots * 3 + 1] = ny;
          slotNormal[slots * 3 + 2] = nz;
          slotAlive[slots] = 1;
          slots++;
        }
      }
    }
  }

  // remaining, unmatched edges, in insertion order
  for (let s = 0; s < slots; s++) {
    if (!slotAlive[s]) continue;
    const v0 = slotIndex0[s] * 3;
    const v1 = slotIndex1[s] * 3;
    vertices.push(pos[v0], pos[v0 + 1], pos[v0 + 2], pos[v1], pos[v1 + 1], pos[v1 + 2]);
  }

  const edges = new THREE.BufferGeometry();
  edges.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  return edges;
}
