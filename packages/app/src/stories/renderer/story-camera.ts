import type { GameScene } from "@paved/renderer";

/**
 * 54 degrees, the play camera's former steepest tilt (TILT-54): the stories' captures keep it, though the game locks the
 * tilt at `PLAY_DEFAULT_POLAR_ANGLE` (#719).
 */
export const STORY_MAX_POLAR = Math.PI * 0.3;

/**
 * Puts the camera at `position`, looking at `target`, at whatever tilt that gives (straight down to `STORY_MAX_POLAR`).
 * The play camera's controls lock the tilt at the game's (#719) and would pull the pose back to it on the next frame, so
 * the range is opened for the story first; no gesture tilts, since rotation stays off.
 */
export function placeCamera(scene: GameScene, target: readonly [number, number, number], position: readonly [number, number, number]): void {
  const controls = scene.controls.controls;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = STORY_MAX_POLAR;
  controls.target.set(...target);
  scene.camera.position.set(...position);
  scene.camera.lookAt(...target);
}
