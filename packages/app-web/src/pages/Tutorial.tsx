import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { GameCanvas } from "@paved/renderer/react";
import { ActionBar, IngameStatus } from "@paved/ui";
import type { HoverState, TileRenderData } from "@paved/renderer";
import { PlanType } from "@paved/game-core";
import { ClosedStructures } from "../components/ClosedStructures";
import { CENTER } from "../utils/game-helpers";
import {
  attempt,
  back,
  closuresOf,
  initialOrientation,
  orientationCode,
  orientationName,
  planCode,
  replay,
  rotate,
  tutorialSteps,
  type TutorialMove,
} from "../tutorial/tutorial-run";
import { loadMoves, saveMoves } from "../tutorial/tutorial-storage";

const panel: CSSProperties = {
  background: "rgba(0,0,0,0.75)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 10,
  padding: 12,
  color: "#f5f5f5",
  maxWidth: 420,
  fontSize: 14,
};
const button: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.25)",
  background: "rgba(255,255,255,0.08)",
  color: "#fff",
  borderRadius: 8,
  padding: "6px 12px",
  cursor: "pointer",
  font: "inherit",
};
const disabledButton: CSSProperties = { ...button, cursor: "default", opacity: 0.5 };
const linkStyle: CSSProperties = { ...button, textDecoration: "none", display: "inline-block" };

/** A position relative to the starter (x east, y north) is the renderer's grid (x east, z south). */
const toGrid = (x: number, y: number) => ({ x, y: 0 - y });

/**
 * `/tutorial`: the scripted game on the off-chain engine (D-21, P-49). No wallet, no indexer and no
 * transaction: the page imports nothing from the chain package. The player places each tile on the
 * highlighted square, rotated like the example; any other move is refused with a word. The moves are
 * kept in `localStorage` and replayed on load.
 */
export function TutorialPage() {
  const [moves, setMoves] = useState<TutorialMove[]>(() => loadMoves());
  const { game, last, step, over } = useMemo(() => replay(moves), [moves]);
  const stepCount = tutorialSteps().length;

  const [orientation, setOrientation] = useState(() => initialOrientation(step));
  // The square the player clicked, relative to the starter; the preset's until they click another.
  const [clicked, setClicked] = useState<{ x: number; y: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const preset = step?.placement ?? null;
  const target = clicked ?? (preset ? { x: preset.x, y: preset.y } : null);
  const hand = game.hand;

  // A new stage starts with its own orientation, the preset's square and no notice.
  const stageIndex = moves.length;
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setOrientation(initialOrientation(tutorialSteps()[stageIndex] ?? null));
    setClicked(null);
    setNotice(null);
  }, [stageIndex]);

  const commit = useCallback((next: TutorialMove[]) => {
    setMoves(next);
    saveMoves(next);
  }, []);

  const play = useCallback(
    (move: TutorialMove) => {
      const result = attempt(moves, move);
      if (result.ok) commit(result.moves);
      else setNotice(result.reason);
    },
    [moves, commit],
  );

  const confirm = useCallback(() => {
    if (over || !target) return;
    play({ kind: "build", orientation, x: target.x, y: target.y });
  }, [over, target, orientation, play]);
  const discard = useCallback(() => {
    if (!over) play({ kind: "discard" });
  }, [over, play]);
  const rotateTile = useCallback(() => setOrientation(rotate), []);
  const goBack = useCallback(() => commit(back(moves)), [commit, moves]);
  const restart = useCallback(() => commit([]), [commit]);

  const tiles = useMemo<TileRenderData[]>(
    () =>
      game.placed().map((t) => ({
        game_id: 0,
        id: t.id,
        player_id: "0x0",
        plan: planCode(t.plan),
        orientation: orientationCode(t.orientation),
        x: CENTER + t.x,
        y: CENTER + t.y,
        worldX: t.x,
        worldZ: 0 - t.y,
      })),
    [game],
  );

  // Only the preset's square is offered (the highlight); the ghost follows the clicked square.
  const slots = useMemo(() => (preset && !over ? [toGrid(preset.x, preset.y)] : []), [preset, over]);
  const hover = useMemo<HoverState | null>(() => {
    if (!hand || !target || step?.kind !== "build" || !preset) return null;
    const grid = toGrid(target.x, target.y);
    const valid = target.x === preset.x && target.y === preset.y && orientationName(orientation) === preset.orientation;
    return { x: grid.x, y: grid.y, valid, idle: true, planIndex: planCode(hand.plan), orientation };
  }, [hand, target, step, preset, orientation]);

  const onTileClick = useCallback(
    (gridX: number, gridY: number) => {
      const x = gridX;
      const y = 0 - gridY;
      setClicked({ x, y });
      if (preset && (x !== preset.x || y !== preset.y)) {
        setNotice("Not this move: place the tile on the highlighted square.");
      } else {
        setNotice(null);
      }
    },
    [preset],
  );

  // Keyboard: R rotates, C confirms, D discards (the buttons are reachable by Tab as well).
  const keys = useRef({ rotateTile, confirm, discard });
  useEffect(() => {
    keys.current = { rotateTile, confirm, discard };
  });
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      switch (e.key.toLowerCase()) {
        case "r":
          keys.current.rotateTile();
          break;
        case "c":
          keys.current.confirm();
          break;
        case "d":
          keys.current.discard();
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const burn = step?.kind === "burn";
  const text = over ? "THE TUTORIAL IS COMPLETE." : (step?.text ?? "");

  return (
    <main aria-label="Tutorial" style={{ width: "100%", height: "100%", position: "relative" }}>
      <GameCanvas
        basePath=""
        tiles={tiles}
        hover={hover}
        availableSlots={slots}
        onTileClick={onTileClick}
        style={{ position: "absolute", inset: 0 }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gridTemplateRows: "auto 1fr auto",
          padding: 16,
          gap: 8,
        }}
      >
        <div style={{ pointerEvents: "auto", gridColumn: 1, gridRow: 1, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
          <IngameStatus score={game.score} built={game.built} totalTiles={game.tileCount} discarded={game.discarded} />
          <ClosedStructures closures={closuresOf(last)} />
        </div>

        <section aria-label="Tutorial stage" style={{ pointerEvents: "auto", gridColumn: 3, gridRow: 1, justifySelf: "end", ...panel, display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: 14 }}>
            Tutorial: {over ? "complete" : `step ${moves.length + 1} of ${stepCount}`}
          </h1>
          <p data-testid="stage-text" role="status" aria-live="polite" style={{ margin: 0 }}>
            {text}
          </p>
          {!over && !burn && <p style={{ margin: 0, opacity: 0.8 }}>Keys: R rotates, C confirms.</p>}
          {burn && <p style={{ margin: 0, opacity: 0.8 }}>Keys: D discards.</p>}
          <p role="alert" data-testid="notice" style={{ margin: 0, color: "#fca5a5", display: notice ? "block" : "none" }}>
            {notice}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={goBack} disabled={moves.length === 0} style={moves.length === 0 ? disabledButton : button}>
              Back
            </button>
            <button type="button" onClick={discard} disabled={!burn} style={burn ? button : disabledButton}>
              Next
            </button>
            <button type="button" onClick={restart} style={button}>
              Restart
            </button>
          </div>
        </section>

        {over && (
          <section
            aria-label="Tutorial complete"
            data-testid="tutorial-complete"
            style={{ pointerEvents: "auto", gridColumn: "1 / -1", gridRow: 2, alignSelf: "center", justifySelf: "center", ...panel, textAlign: "center", display: "flex", flexDirection: "column", gap: 10 }}
          >
            <h2 style={{ margin: 0 }}>Tutorial complete</h2>
            <p data-testid="final-score" style={{ margin: 0 }}>Final score: {game.score}</p>
            <p style={{ margin: 0 }}>You know how roads, cities, forests and wonders score. Now play for real.</p>
            {/* U2: the claim button of the tutorial achievement goes here, once CORE's Setup system lands (D-24, D-25). */}
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              {/* Training's route, buildGameRoute with mode training, once T1 is on main; until then the Landing. */}
              <Link to="/" style={linkStyle}>
                Training
              </Link>
              <Link to="/" style={linkStyle}>
                Landing
              </Link>
            </div>
          </section>
        )}

        {!over && (
          <div style={{ pointerEvents: "auto", gridColumn: "1 / -1", gridRow: 3, alignSelf: "end" }}>
            <ActionBar
              tilePlan={planCode(hand?.plan ?? PlanType.None)}
              orientation={orientation}
              onRotate={rotateTile}
              onConfirm={confirm}
              onDiscard={discard}
              confirmDisabled={!hand || burn}
              discardDisabled={!hand || !burn}
            />
          </div>
        )}
      </div>
    </main>
  );
}
