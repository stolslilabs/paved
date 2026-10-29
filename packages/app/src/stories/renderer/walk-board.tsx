import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BoardTile } from "@paved/chain";
import { DEFAULT_WALK_SETTINGS, stickLookRate, type GameScene, type WalkControl, type WalkSettingsInput, type WalkState } from "@paved/renderer";
import { BoardViewport } from "../../components/containers/board-viewport";
import { WalkControls, type WalkInputKind } from "../../components/containers/walk-controls";
import { Button } from "../../components/ui/button";
import { useWalkInput } from "../../lib/use-walk-input";
import { APP_ASSETS } from "../../mocks/assets";
import { LAYOUT_GROWING, LAYOUT_START } from "../../mocks/village-v2";

const CENTER = 2_147_483_647;
/** A village's cells counted from the board's centre, as the home's canvas draws them. */
const onBoard = (tiles: readonly BoardTile[]): BoardTile[] => tiles.map((t) => ({ ...t, x: CENTER + t.x, y: CENTER + t.y }));

/** The two villages of the prototype (#876): a starter one (9 tiles) and a large one (22 tiles). */
export const WALK_VILLAGES = {
  starter: onBoard(LAYOUT_START.tiles),
  large: onBoard(LAYOUT_GROWING.tiles),
} satisfies Record<string, BoardTile[]>;
export type WalkVillage = keyof typeof WALK_VILLAGES;

export interface WalkBoardProps {
  village: WalkVillage;
  /** The sticks or the keys and mouse; "auto" by the pointer (coarse: touch). */
  input: WalkInputKind | "auto";
  /** Start walking once the board is drawn (the walking states), rather than on "Walk". */
  autoWalk: boolean;
  /** The walk's knobs to tune (open point 2: the eye's height). */
  eyeVoxels: number;
  speed: number;
  fov: number;
  bobVoxels: number;
}

type Phase = "orbit" | "loading" | WalkState["phase"];

/** Whether the main pointer is coarse (touch). */
const coarse = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

/**
 * The first-person walk's prototype (V4-WALK-1, #876): a village in the orbit view with a "Walk" button (the Camera mode's, #875,
 * comes with PR 2); the walk drops on the road nearest the screen's centre, eased down; Exit (or Escape) lifts it back. On touch
 * two sticks, on a desktop the keys and the mouse. A readout gives the walk's state.
 */
export function WalkBoard({ village, input, autoWalk, eyeVoxels, speed, fov, bobVoxels }: WalkBoardProps) {
  const settings = useMemo<WalkSettingsInput>(() => ({ eyeVoxels, speed, fov, bobVoxels }), [eyeVoxels, speed, fov, bobVoxels]);
  const kind: WalkInputKind = input === "auto" ? (coarse() ? "touch" : "desktop") : input;
  const box = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<GameScene | null>(null);
  const [control, setControl] = useState<WalkControl | null>(null);
  const [phase, setPhase] = useState<Phase>("orbit");
  const [state, setState] = useState<WalkState | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Counts the walks asked: an Exit while one loads, or a new board, makes the pending one stale.
  const attempt = useRef(0);

  // A new board (another village remounts it) has no walk: back to its orbit view.
  useEffect(() => {
    attempt.current++;
    setControl(null);
    setState(null);
    setMessage(null);
    setPhase("orbit");
  }, [scene]);

  const walk = useCallback(async () => {
    if (!scene || phase !== "orbit") return;
    const mine = ++attempt.current;
    setPhase("loading");
    setMessage(null);
    const started = await scene.startWalk(settings);
    if (mine !== attempt.current) return;
    if (!started) {
      setPhase("orbit");
      setMessage("No street to walk here yet");
      return;
    }
    setControl(started);
    setPhase("entering");
  }, [scene, phase, settings]);

  const exit = useCallback(async () => {
    if (!scene) return;
    // Still loading: the walk is cancelled, not entered.
    if (!control) {
      attempt.current++;
      void scene.stopWalk();
      setPhase("orbit");
      return;
    }
    const mine = attempt.current;
    setPhase("leaving");
    await scene.stopWalk();
    if (mine !== attempt.current) return;
    setControl(null);
    setState(null);
    setPhase("orbit");
  }, [scene, control]);

  const { mouseLocked } = useWalkInput(control, box, () => void exit(), kind === "desktop");

  // The knobs follow the controls under way.
  useEffect(() => {
    scene?.setWalkSettings(settings);
  }, [scene, settings]);

  // The walking states start once the board is drawn.
  useEffect(() => {
    if (!autoWalk || !scene) return;
    const timer = setTimeout(() => void walk(), 400);
    return () => clearTimeout(timer);
  }, [autoWalk, scene]); // eslint-disable-line react-hooks/exhaustive-deps

  // The readout and the phase, a few times a second while walking.
  useEffect(() => {
    if (!scene || !control) return;
    const read = () => {
      const now = scene.getWalk();
      setState(now);
      if (now && now.phase !== "leaving") setPhase(now.phase);
    };
    read();
    const timer = setInterval(read, 200);
    return () => clearInterval(timer);
  }, [scene, control]);

  const lookRate = useMemo(() => ({ stickRadiansPerSecond: DEFAULT_WALK_SETTINGS.stickRadiansPerSecond }), []);
  return (
    // Inline styles: a story class the app does not use would grow the app's CSS (Tailwind scans the stories).
    <div ref={box} style={{ position: "relative", height: "100dvh", overflow: "hidden", background: "var(--background)" }} data-testid="walk-board">
      <BoardViewport key={village} tiles={WALK_VILLAGES[village]} gameId={1} basePath={APP_ASSETS} tilePreview={false} placementHighlight={false} onScene={setScene} />
      {phase === "orbit" ? (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: "max(1rem, env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "0 16px" }}>
          {message && <p style={{ margin: 0, fontSize: 14, textAlign: "center" }}>{message}</p>}
          <Button size="lg" disabled={!scene} onClick={() => void walk()}>
            Walk
          </Button>
        </div>
      ) : (
        <WalkControls
          input={kind}
          phase={phase}
          mouseLocked={mouseLocked}
          onExit={() => void exit()}
          onMove={(tilt) => control?.setMove(tilt)}
          onLook={(tilt) => control?.setLookRate(stickLookRate(tilt, lookRate))}
        />
      )}
      {state && (
        <p
          data-testid="walk-readout"
          style={{ position: "absolute", top: "max(0.75rem, env(safe-area-inset-top))", right: "max(0.75rem, env(safe-area-inset-right))", maxWidth: "45%", margin: 0, padding: "4px 8px", borderRadius: 6, background: "color-mix(in oklab, var(--background) 70%, transparent)", fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "right", pointerEvents: "none" }}
        >
          {state.phase} · {state.ground} · x {state.x.toFixed(2)} z {state.z.toFixed(2)} · yaw {Math.round((state.yaw * 180) / Math.PI)}° pitch {Math.round((state.pitch * 180) / Math.PI)}° · built in {Math.round(state.buildMs)} ms · {state.walkable} columns
        </p>
      )}
    </div>
  );
}
