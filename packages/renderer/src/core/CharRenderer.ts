import * as THREE from "three";
import { TILE_SIZE } from "./types";
import type { CharacterRenderData } from "./types";

// Character pedestal dimensions (from CharTexture.tsx)
const BASE_RADIUS_FACTOR = 1.2;
const MAIN_RADIUS_FACTOR = 1.0;
const INNER_RADIUS_FACTOR = 0.8;
const BASE_HEIGHT = 0.1;
const MAIN_HEIGHT = 0.12;
const INNER_HEIGHT = 0.14;
const ROD_RADIUS = 0.01;
const BILLBOARD_HEIGHT = 0.03;
const SEGMENTS = 32;

export class CharRenderer {
  private group: THREE.Group;
  private charMeshes: Map<string, THREE.Group> = new Map();
  private radius: number;
  private height: number;
  private squareSize: number;

  constructor(radius = 0.3, height = 1.5, squareSize = TILE_SIZE) {
    this.group = new THREE.Group();
    this.radius = radius;
    this.height = height;
    this.squareSize = squareSize;
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  updateCharacters(characters: CharacterRenderData[]): void {
    const currentKeys = new Set<string>();

    for (const char of characters) {
      const key = `${char.gameId}-${char.playerId}-${char.index}`;
      currentKeys.add(key);

      if (this.charMeshes.has(key)) continue;

      const mesh = this.createCharacter(char);
      this.group.add(mesh);
      this.charMeshes.set(key, mesh);
    }

    // Remove characters no longer present
    for (const [key, mesh] of this.charMeshes) {
      if (!currentKeys.has(key)) {
        this.group.remove(mesh);
        this.disposeMesh(mesh);
        this.charMeshes.delete(key);
      }
    }
  }

  private createCharacter(char: CharacterRenderData): THREE.Group {
    const charGroup = new THREE.Group();
    const color = new THREE.Color(char.color);

    // Pedestal base (dark)
    const baseGeom = new THREE.CylinderGeometry(
      this.radius * BASE_RADIUS_FACTOR,
      this.radius * BASE_RADIUS_FACTOR,
      BASE_HEIGHT,
      SEGMENTS
    );
    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const baseMesh = new THREE.Mesh(baseGeom, baseMaterial);
    baseMesh.position.y = BASE_HEIGHT / 2;
    charGroup.add(baseMesh);

    // Main pedestal (character color)
    const mainGeom = new THREE.CylinderGeometry(
      this.radius * MAIN_RADIUS_FACTOR,
      this.radius * MAIN_RADIUS_FACTOR,
      MAIN_HEIGHT,
      SEGMENTS
    );
    const mainMaterial = new THREE.MeshStandardMaterial({ color });
    const mainMesh = new THREE.Mesh(mainGeom, mainMaterial);
    mainMesh.position.y = BASE_HEIGHT + MAIN_HEIGHT / 2;
    charGroup.add(mainMesh);

    // Inner circle (lighter color)
    const innerGeom = new THREE.CylinderGeometry(
      this.radius * INNER_RADIUS_FACTOR,
      this.radius * INNER_RADIUS_FACTOR,
      INNER_HEIGHT,
      SEGMENTS
    );
    const innerMaterial = new THREE.MeshStandardMaterial({
      color: color.clone().lerp(new THREE.Color(0xffffff), 0.3),
    });
    const innerMesh = new THREE.Mesh(innerGeom, innerMaterial);
    innerMesh.position.y = BASE_HEIGHT + INNER_HEIGHT / 2;
    charGroup.add(innerMesh);

    // Vertical rod
    const rodGeom = new THREE.CylinderGeometry(
      ROD_RADIUS,
      ROD_RADIUS,
      this.height * 2,
      SEGMENTS
    );
    const rodMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const rodMesh = new THREE.Mesh(rodGeom, rodMaterial);
    rodMesh.position.y = this.height;
    charGroup.add(rodMesh);

    // Billboard disc at top
    const discGeom = new THREE.CylinderGeometry(
      this.radius * BASE_RADIUS_FACTOR,
      this.radius * BASE_RADIUS_FACTOR,
      BILLBOARD_HEIGHT,
      SEGMENTS
    );
    const discMaterial = new THREE.MeshStandardMaterial({ color });
    const discMesh = new THREE.Mesh(discGeom, discMaterial);
    discMesh.position.y = this.height * 2;
    // Tag for billboard update
    discMesh.userData.isBillboard = true;
    charGroup.add(discMesh);

    // Position in world
    charGroup.position.set(
      char.worldX * this.squareSize,
      0,
      char.worldZ * this.squareSize
    );

    return charGroup;
  }

  // Pre-allocated vectors to avoid GC pressure in render loop
  private static _cameraPos = new THREE.Vector3();
  private static _worldPos = new THREE.Vector3();

  /** Call each frame to make billboard discs face the camera */
  updateBillboards(camera: THREE.Camera): void {
    const cameraPos = CharRenderer._cameraPos.copy(camera.position);
    for (const [, charGroup] of this.charMeshes) {
      charGroup.traverse((child) => {
        if (child.userData.isBillboard) {
          child.getWorldPosition(CharRenderer._worldPos);
          child.lookAt(cameraPos.x, CharRenderer._worldPos.y, cameraPos.z);
        }
      });
    }
  }

  private disposeMesh(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material?.dispose();
        }
      }
    });
  }

  dispose(): void {
    for (const [, mesh] of this.charMeshes) {
      this.disposeMesh(mesh);
    }
    this.charMeshes.clear();
  }
}
