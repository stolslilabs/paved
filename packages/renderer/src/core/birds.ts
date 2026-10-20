// The birds (BIRDS, #574): their own chunk, an ambient effect on the one ambient loop (`ambient-loop.ts`). Now and then one bird,
// or a small flock (boids), rises out of a tree's crown, flies low to another tree and sinks into its crown. The perches are the
// tree tops of each model type, found once per type from its voxel grid (`bird-perches.ts`). The board does not call the birds
// yet: the stories (`Renderer/Birds`) do, to judge the effect before it goes into the game.
import * as THREE from "three";
import { isOutline } from "./outlines";
import { paletteOfModel } from "./feature-layout";
import { VoxelCache } from "./voxelizer";
import { findPerches, vegetationOf } from "./bird-perches";
import { MAX_BIRDS, type BirdSettings } from "./bird-settings";
import { TILE_SIZE } from "./types";
import type { AmbientEffect } from "./ambient-loop";

/** A drawn tile the birds may perch on: its model's id, the model type (`AssetLoader.getModel`) and the tile's model, placed. */
export interface BirdSource {
  key: string;
  type: THREE.Object3D;
  tile: THREE.Object3D;
}

/** Where a bird is in its flight. */
export type BirdState = "waiting" | "takeoff" | "cruise" | "landing" | "settling";

interface Flight {
  birds: Bird[];
  /** The cruise height, in the frame's units. */
  cruiseY: number;
}

interface Bird {
  flight: Flight;
  state: BirdState;
  /** Seconds in the state. */
  t: number;
  /** Seconds before it takes off (the birds of a flock leave one after the other). */
  delay: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  to: THREE.Vector3;
  /** Where and how fast the landing glide began. */
  landFrom: THREE.Vector3;
  landVel: THREE.Vector3;
  /** Its wingbeat's phase (radians), so a flock does not beat in step. */
  phase: number;
  scale: number;
  flap: number;
}

/** A 32-bit seeded generator (mulberry32): the same flights for a seed, for the tests and the captures. */
export function random32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The wings' hinge, in the bird's frame (its length is 1, forward +Z): where a wing turns as it beats. */
const HINGE_X = 0.13;
const HINGE_Y = 0.04;

/**
 * A bird of a few cubes, 1 long, forward +Z: body, head, tail and two wings. `aWing` is -1 on the left wing, 1 on the right, 0
 * elsewhere: the vertex shader turns the wings about their hinge.
 */
export function birdGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const wings: number[] = [];
  const box = (sx: number, sy: number, sz: number, cx: number, cy: number, cz: number, wing: number) => {
    const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
    g.translate(cx, cy, cz);
    positions.push(...g.getAttribute("position").array);
    normals.push(...g.getAttribute("normal").array);
    for (let i = 0; i < g.getAttribute("position").count; i++) wings.push(wing);
    g.dispose();
  };
  box(0.26, 0.2, 0.62, 0, 0, 0, 0);
  box(0.18, 0.18, 0.18, 0, 0.06, 0.38, 0);
  box(0.16, 0.04, 0.22, 0, 0.02, -0.4, 0);
  box(0.46, 0.03, 0.3, -(HINGE_X + 0.23), HINGE_Y, 0.02, -1);
  box(0.46, 0.03, 0.3, HINGE_X + 0.23, HINGE_Y, 0.02, 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("aWing", new THREE.Float32BufferAttribute(wings, 1));
  return geometry;
}

/** The wingbeat in the vertex shader: the wings turn about their hinge by `aFlap.x` (the beat's strength) at `uFlapHz`. */
const WING_NORMAL = /* glsl */ `
  #include <beginnormal_vertex>
  float wingAngle = aWing * (aFlap.x * sin(uTime * uFlapHz * 6.2831853 + aFlap.y) * 1.1 + 0.12);
  mat2 wingTurn = mat2(cos(wingAngle), sin(wingAngle), -sin(wingAngle), cos(wingAngle));
  if (aWing != 0.0) objectNormal.xy = wingTurn * objectNormal.xy;
`;
const WING_POSITION = /* glsl */ `
  #include <begin_vertex>
  if (aWing != 0.0) {
    vec2 hinge = vec2(aWing * ${HINGE_X.toFixed(3)}, ${HINGE_Y.toFixed(3)});
    transformed.xy = hinge + wingTurn * (transformed.xy - hinge);
  }
`;

/** The first mesh of a model type and the matrix from its geometry to the type's root (the model's frame). */
function meshOf(type: THREE.Object3D): { geometry: THREE.BufferGeometry; toModel: THREE.Matrix4 } | null {
  type.updateMatrixWorld(true);
  const toRoot = type.matrixWorld.clone().invert();
  let found: { geometry: THREE.BufferGeometry; toModel: THREE.Matrix4 } | null = null;
  type.traverse((child) => {
    if (found || !(child instanceof THREE.Mesh) || isOutline(child) || !(child.geometry as THREE.BufferGeometry).getAttribute("uv")) return;
    found = { geometry: child.geometry, toModel: toRoot.clone().multiply(child.matrixWorld) };
  });
  return found;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How long a bird takes to sink into the crown it landed on, seconds. */
const SETTLE_SECONDS = 0.45;
/** The closest and the shortest a flight goes: a tree at least this far, in tiles, when there is one in range. */
const MIN_HOP_TILES = 0.4;
/** The birds of a flock land on trees within this many tiles of the one the flight aims at, else around its top. */
const FLOCK_SPREAD_TILES = 0.75;

const NO_PERCHES = new Float32Array(0);

/**
 * The birds on the board: one `InstancedMesh` (one draw while a bird flies, none otherwise) under `object`, which the caller adds to
 * the board's group (`frame` of `setTiles`). `time` is the ambient loop's uniform: the wingbeat is in the vertex shader; the flight
 * itself (a few birds) is stepped on the CPU, at the loop's rate. `setNight(true)` holds the flights (the birds roost): the ones in
 * the air land. `dispose` frees the geometries and materials (the voxel grids are plain arrays).
 */
export class Birds implements AmbientEffect {
  readonly object = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
  private readonly flap: THREE.InstancedBufferAttribute;
  private markers: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  private readonly flapHz = { value: 0 };
  private readonly grids = new VoxelCache();
  private readonly perchesOf = new Map<string, Float32Array>();
  private readonly building = new Set<string>();
  private sources: BirdSource[] = [];
  private frame: THREE.Object3D | null = null;
  /** The board's perches, in the frame's units. */
  private perches: THREE.Vector3[] = [];
  private birds: Bird[] = [];
  private settings: BirdSettings;
  private random: () => number;
  private last: number | null = null;
  private nextFlight: number | null = null;
  private roosting = false;
  private drawn = 0;
  private flights = 0;
  private disposed = false;
  /** Called when perches land (a type's grid was built): the scene draws a frame (the markers). */
  onChange: (() => void) | null = null;
  /** Called on each step that moved a bird while the birds cast shadows: the scene redraws its shadow map. */
  onShadow: (() => void) | null = null;

  constructor(time: { value: number }, settings: BirdSettings, seed = 1) {
    this.settings = settings;
    this.random = random32(seed);
    this.object.name = "birds";
    const geometry = birdGeometry();
    this.flap = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BIRDS * 2), 2);
    this.flap.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aFlap", this.flap);
    const material = new THREE.MeshLambertMaterial({ name: "Birds" });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.uniforms.uFlapHz = this.flapHz;
      shader.vertexShader = `attribute float aWing;\nattribute vec2 aFlap;\nuniform float uTime;\nuniform float uFlapHz;\n${shader.vertexShader}`
        .replace("#include <beginnormal_vertex>", WING_NORMAL)
        .replace("#include <begin_vertex>", WING_POSITION);
    };
    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_BIRDS);
    this.mesh.name = "birds-flying";
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // The birds move every step: no bounding sphere would hold them, and there is one draw for all.
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.object.add(this.mesh);

    this.markers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: "#ff3d7f" }), 1);
    this.markers.name = "bird-perches";
    this.markers.frustumCulled = false;
    this.markers.count = 0;
    this.markers.visible = false;
    this.object.add(this.markers);
    this.applySettings();
  }

  setSettings(settings: BirdSettings): void {
    this.settings = settings;
    this.applySettings();
  }

  private applySettings(): void {
    this.mesh.material.color.set(this.settings.color);
    this.mesh.castShadow = this.settings.shadows;
    this.flapHz.value = this.settings.flapHz;
    this.placeMarkers();
  }

  /**
   * The board's drawn tiles and the group the birds fly in (`frame`, the board's: the compass turns both). The perches of the types
   * known are placed now; the others are built in idle slices and placed as each lands.
   */
  setTiles(sources: BirdSource[], frame: THREE.Object3D): void {
    this.sources = sources;
    this.frame = frame;
    for (const { key, type } of sources) {
      if (this.perchesOf.has(key) || this.building.has(key)) continue;
      const mesh = meshOf(type);
      if (!mesh) {
        this.perchesOf.set(key, NO_PERCHES);
        continue;
      }
      this.building.add(key);
      void this.grids.request(key, mesh, () => this.disposed).then((grid) => {
        this.building.delete(key);
        if (this.disposed) return;
        this.perchesOf.set(key, grid ? findPerches(grid, vegetationOf(paletteOfModel(key) ?? "base")) : NO_PERCHES);
        this.placePerches();
        this.onChange?.();
      });
    }
    this.placePerches();
  }

  /** Resolves once every type asked for has its perches: for tests and captures. */
  async whenReady(): Promise<void> {
    while (this.building.size > 0) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  /** The perches of a type in its model's frame (x, y, z each), once built. */
  perchesOfType(key: string): Float32Array | undefined {
    return this.perchesOf.get(key);
  }

  /** The board's perches, in the frame's units. */
  boardPerches(): readonly THREE.Vector3[] {
    return this.perches;
  }

  private placePerches(): void {
    if (this.disposed || !this.frame) return;
    this.frame.updateMatrixWorld(true);
    const toFrame = this.frame.matrixWorld.clone().invert();
    const perches: THREE.Vector3[] = [];
    for (const { key, tile } of this.sources) {
      const local = this.perchesOf.get(key);
      if (!local?.length) continue;
      tile.updateWorldMatrix(true, false);
      const matrix = toFrame.clone().multiply(tile.matrixWorld);
      for (let i = 0; i < local.length; i += 3) perches.push(new THREE.Vector3(local[i], local[i + 1], local[i + 2]).applyMatrix4(matrix));
    }
    this.perches = perches;
    this.placeMarkers();
  }

  /** The perches shown as small cubes (the stories' check of the tree tops): one more draw. */
  showPerches(on: boolean): void {
    this.markers.visible = on;
    this.placeMarkers();
  }

  private placeMarkers(): void {
    if (!this.markers.visible) return;
    if (this.markers.instanceMatrix.count < this.perches.length) {
      const old = this.markers;
      const grown = new THREE.InstancedMesh(old.geometry, old.material, Math.max(1, this.perches.length));
      grown.name = old.name;
      grown.frustumCulled = false;
      this.object.remove(old);
      old.dispose();
      this.markers = grown;
      this.object.add(grown);
    }
    const m = new THREE.Matrix4();
    const side = this.settings.size * 0.35;
    this.perches.forEach((p, i) => this.markers.setMatrixAt(i, m.makeScale(side, side, side).setPosition(p.x, p.y + side / 2, p.z)));
    this.markers.count = this.perches.length;
    this.markers.instanceMatrix.needsUpdate = true;
  }

  /** Night or day: at night no flight starts (the birds roost); the ones in the air land. */
  setNight(roosting: boolean): void {
    this.roosting = roosting;
  }

  /**
   * Starts a flight now: one bird, or a flock (`kind`; unset, by the settings' share), from a tree at random, or from the one nearest
   * `near` (in the frame's units: the stories' "Fly now" takes the camera's target). False when there is no flight to make: fewer
   * than two perches, or the air full (`MAX_BIRDS`).
   */
  launch(kind?: "single" | "flock", near?: { x: number; z: number }): boolean {
    const s = this.settings;
    const free = MAX_BIRDS - this.birds.length;
    if (this.perches.length < 2 || free <= 0) return false;
    const flock = kind ? kind === "flock" : this.random() < s.flockShare;
    const count = Math.min(free, flock ? 2 + Math.floor(this.random() * (s.flockSize - 1)) : 1);
    let from = this.perches[Math.floor(this.random() * this.perches.length)]!;
    if (near) for (const p of this.perches) if (Math.hypot(p.x - near.x, p.z - near.z) < Math.hypot(from.x - near.x, from.z - near.z)) from = p;
    const aim = this.target(from);
    const flatDistance = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
    // The flock's landing spots: the trees nearest the one aimed at, then around its top again.
    const spots = this.perches
      .filter((p) => p !== from && flatDistance(p, aim) <= FLOCK_SPREAD_TILES * TILE_SIZE)
      .sort((a, b) => flatDistance(a, aim) - flatDistance(b, aim));
    const flight: Flight = { birds: [], cruiseY: Math.max(from.y, aim.y) + s.flightHeight };
    for (let i = 0; i < count; i++) {
      const jitter = () => (this.random() - 0.5) * s.size * 1.6;
      const spot = spots[i];
      const to = spot ? spot.clone() : aim.clone().add(new THREE.Vector3(jitter(), 0, jitter()));
      const pos = from.clone().add(new THREE.Vector3(i ? jitter() : 0, -s.size * 0.5, i ? jitter() : 0));
      const bird: Bird = {
        flight,
        state: "waiting",
        t: 0,
        delay: i === 0 ? 0 : (0.1 + this.random() * 0.5) * s.takeoffSeconds,
        pos,
        vel: new THREE.Vector3(0, 0, 0),
        to,
        landFrom: new THREE.Vector3(),
        landVel: new THREE.Vector3(),
        phase: this.random() * Math.PI * 2,
        scale: 0,
        flap: 0,
      };
      flight.birds.push(bird);
      this.birds.push(bird);
    }
    this.flights++;
    return true;
  }

  /** A tree to fly to from `from`: one in range and not too close, at random; else the nearest other tree. */
  private target(from: THREE.Vector3): THREE.Vector3 {
    const range = this.settings.rangeTiles * TILE_SIZE;
    const distance = (p: THREE.Vector3) => Math.hypot(p.x - from.x, p.z - from.z);
    const inRange = this.perches.filter((p) => p !== from && distance(p) >= MIN_HOP_TILES * TILE_SIZE && distance(p) <= range);
    if (inRange.length) return inRange[Math.floor(this.random() * inRange.length)]!;
    let nearest = this.perches.find((p) => p !== from)!;
    for (const p of this.perches) if (p !== from && distance(p) < distance(nearest)) nearest = p;
    return nearest;
  }

  /** A gap to the next flight: an exponential law around the mean, held within a third and three times it. */
  private gap(): number {
    const mean = this.settings.intervalSeconds;
    return Math.min(3 * mean, Math.max(mean / 3, -Math.log(1 - this.random()) * mean));
  }

  /** The loop stepped to `seconds`: flights start, the birds fly. True while a bird shows (and once more as the last one goes). */
  step(seconds: number): boolean {
    const dt = this.last === null ? 0 : Math.min(0.1, Math.max(0, seconds - this.last));
    this.last = seconds;
    if (this.nextFlight === null) this.nextFlight = seconds + this.gap();
    if (seconds >= this.nextFlight) {
      if (!this.roosting) this.launch();
      this.nextFlight = seconds + this.gap();
    }
    for (const bird of this.birds) this.fly(bird, dt, seconds);
    this.birds = this.birds.filter((b) => !(b.state === "settling" && b.t >= SETTLE_SECONDS));
    const before = this.drawn;
    this.draw();
    const moved = this.drawn > 0 || before > 0;
    if (moved && this.settings.shadows) this.onShadow?.();
    return moved;
  }

  private fly(bird: Bird, dt: number, seconds: number): void {
    const s = this.settings;
    bird.t += dt;
    const flatTo = new THREE.Vector3(bird.to.x - bird.pos.x, 0, bird.to.z - bird.pos.z);
    const flat = flatTo.length();
    const landRadius = s.speed * s.landingSeconds * 0.55;
    switch (bird.state) {
      case "waiting":
        if (bird.t >= bird.delay) [bird.state, bird.t] = ["takeoff", 0];
        return;
      case "takeoff":
      case "cruise": {
        const rise = bird.state === "takeoff" ? Math.min(1, bird.t / s.takeoffSeconds) : 1;
        bird.scale = smoothstep(0, 0.35, rise);
        const desired = flatTo.normalize().multiplyScalar(s.speed * (0.25 + 0.75 * rise));
        desired.y = THREE.MathUtils.clamp((bird.flight.cruiseY - bird.pos.y) * 3, -s.speed, s.speed);
        desired.add(this.boids(bird));
        bird.vel.lerp(desired, Math.min(1, dt * (bird.state === "takeoff" ? 6 : 4)));
        bird.pos.addScaledVector(bird.vel, dt);
        bird.flap = bird.state === "takeoff" || bird.vel.y > 0.15 * s.speed ? 1 : Math.sin(seconds * 0.9 + bird.phase * 3) > 0.35 ? 0.12 : 0.8;
        if (bird.state === "takeoff" && rise >= 1) [bird.state, bird.t] = ["cruise", 0];
        if ((bird.state === "cruise" || rise >= 0.5) && flat <= landRadius) {
          bird.state = "landing";
          bird.t = 0;
          bird.landFrom.copy(bird.pos);
          bird.landVel.copy(bird.vel);
        }
        return;
      }
      case "landing": {
        // A Hermite glide from where the landing began, at its speed, onto the perch, arriving slow and from a little above.
        const T = s.landingSeconds;
        const u = Math.min(1, bird.t / T);
        const arrive = new THREE.Vector3(bird.to.x - bird.landFrom.x, 0, bird.to.z - bird.landFrom.z).normalize().multiplyScalar(0.25 * s.speed);
        arrive.y = -0.35 * s.speed;
        const [h00, h10, h01, h11] = [2 * u ** 3 - 3 * u ** 2 + 1, u ** 3 - 2 * u ** 2 + u, -2 * u ** 3 + 3 * u ** 2, u ** 3 - u ** 2];
        const [d00, d10, d01, d11] = [6 * u ** 2 - 6 * u, 3 * u ** 2 - 4 * u + 1, -6 * u ** 2 + 6 * u, 3 * u ** 2 - 2 * u];
        const p0 = bird.landFrom;
        const v0 = bird.landVel;
        bird.pos.set(
          h00 * p0.x + h10 * T * v0.x + h01 * bird.to.x + h11 * T * arrive.x,
          h00 * p0.y + h10 * T * v0.y + h01 * bird.to.y + h11 * T * arrive.y,
          h00 * p0.z + h10 * T * v0.z + h01 * bird.to.z + h11 * T * arrive.z,
        );
        bird.vel.set(
          (d00 * p0.x + d01 * bird.to.x) / T + d10 * v0.x + d11 * arrive.x,
          (d00 * p0.y + d01 * bird.to.y) / T + d10 * v0.y + d11 * arrive.y,
          (d00 * p0.z + d01 * bird.to.z) / T + d10 * v0.z + d11 * arrive.z,
        );
        bird.scale = 1;
        // A glide, then a few beats to brake.
        bird.flap = u < 0.7 ? 0.15 : 1;
        if (u >= 1) [bird.state, bird.t] = ["settling", 0];
        return;
      }
      case "settling": {
        // It sinks into the crown and is gone: the tree hides it.
        const k = smoothstep(0, SETTLE_SECONDS, bird.t);
        bird.scale = 1 - k;
        bird.pos.set(bird.to.x, bird.to.y - s.size * 0.6 * k, bird.to.z);
        bird.vel.set(bird.vel.x * 0.5, 0, bird.vel.z * 0.5);
        bird.flap = 0.6 * (1 - k);
        return;
      }
    }
  }

  /** The flock's pull on a bird in the air (boids): apart from the nearest, along the others' heading, toward their centre. */
  private boids(bird: Bird): THREE.Vector3 {
    const force = new THREE.Vector3();
    const flock = bird.flight.birds.filter((o) => o !== bird && (o.state === "takeoff" || o.state === "cruise"));
    if (!flock.length) return force;
    const s = this.settings;
    const apart = s.size * 2.2;
    const centre = new THREE.Vector3();
    const heading = new THREE.Vector3();
    const diff = new THREE.Vector3();
    for (const other of flock) {
      centre.add(other.pos);
      heading.add(other.vel);
      diff.subVectors(bird.pos, other.pos);
      const d = diff.length();
      if (d > 0 && d < apart) force.addScaledVector(diff, ((1 - d / apart) * s.speed * 1.5) / d);
    }
    centre.divideScalar(flock.length).sub(bird.pos);
    heading.divideScalar(flock.length).sub(bird.vel);
    return force.addScaledVector(heading, 0.5).addScaledVector(centre, 0.8);
  }

  /** Writes the birds that show into the instances, in order: one draw for all of them, none when none shows. */
  private draw(): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler(0, 0, 0, "YXZ");
    const scale = new THREE.Vector3();
    let n = 0;
    for (const bird of this.birds) {
      if (bird.state === "waiting" || bird.scale <= 0.001) continue;
      const flat = Math.hypot(bird.vel.x, bird.vel.z);
      const yaw = flat > 1e-4 ? Math.atan2(bird.vel.x, bird.vel.z) : e.y;
      const pitch = THREE.MathUtils.clamp(Math.atan2(bird.vel.y, Math.max(flat, 1e-4)), -0.6, 0.6);
      e.set(-pitch, yaw, 0);
      q.setFromEuler(e);
      scale.setScalar(this.settings.size * bird.scale);
      this.mesh.setMatrixAt(n, m.compose(bird.pos, q, scale));
      this.flap.setXY(n, bird.flap, bird.phase);
      n++;
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.flap.needsUpdate = true;
    this.drawn = n;
  }

  /** The birds in the air (shown), the board's perches, the flights so far, and the draws the birds take (the markers' too). */
  stats(): { flying: number; perches: number; flights: number; drawCalls: number } {
    return {
      flying: this.drawn,
      perches: this.perches.length,
      flights: this.flights,
      drawCalls: (this.mesh.visible ? 1 : 0) + (this.markers.visible && this.markers.count > 0 ? 1 : 0),
    };
  }

  /** The birds by state, for the tests. */
  states(): BirdState[] {
    return this.birds.map((b) => b.state);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
    this.markers.geometry.dispose();
    this.markers.material.dispose();
    this.markers.dispose();
    this.object.removeFromParent();
    this.object.clear();
    this.grids.clear();
    this.perchesOf.clear();
    this.birds = [];
    this.perches = [];
    this.sources = [];
    this.frame = null;
    this.onChange = null;
    this.onShadow = null;
  }
}
