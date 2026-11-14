import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { CONQUEST_PROVINCE } from "@paved/game-core";
import type { GameScene } from "@paved/renderer";
import type { BoardTile } from "@paved/chain";
import { toastError } from "../../components/containers/error-toast";
import { ConquestMapScene } from "../../components/scenes/conquest-map-scene";
import { useBoardSettings } from "../../data/board-settings";
import { useConquestArea, useConquestOptions, useConquestState, useConquestZone, useExploreConquest, useGiveConquest, useRequestConquest } from "../../data/conquest";
import { RENDERER_ASSETS } from "../../data/renderer-manifest";
import { useTileArt } from "../../data/tile-art";
import { hasWebGL } from "../../lib/webgl";
import { BoardCanvas } from "../board-canvas";
import { conquestZoneOf } from "../conquest-play";
import { errorDetail } from "../error-detail";
import { usePuzzleViewer } from "../puzzle-play";
import { useAppNavigate, useUpTo } from "../ref";

/** Board centre of the contracts (0x7FFFFFFF): where the board's scene opens. */
const CENTER = 2_147_483_647;
const MIDDLE = (CONQUEST_PROVINCE - 1) / 2;

/** A refused write, as a toast: the page has no place for it. */
const refused = (error: unknown) => toastError({ title: "Conquest", message: error instanceof Error ? error.message : String(error), detail: errorDetail(error) });

/**
 * `/conquest` (the season's finale): the Conquest's map as a board scene. It opens on the zone named by `?zone=`, else on the current
 * account's own province. The board draws the world round the zone under the middle of the view (`useConquestArea`: the zone and a
 * band of its neighbours), its origin held on the zone it opened on, so a pan crosses into the next zone without a jump and the area
 * follows. The fog is the Conquest's own: a cell is clear once explored. A tap picks a cell; the scene's foot says what it offers
 * and holds its one action. The World grid loads another zone's scene; Back to my zone returns home. Without WebGL (or when the
 * renderer cannot start) the zone is drawn as a grid.
 */
export default function Page() {
  const me = usePuzzleViewer();
  const go = useAppNavigate();
  const onBack = useUpTo("/play/conquest");
  const [params] = useSearchParams();
  const state = useConquestState(me);
  const side = state.data?.side ?? 0;
  const named = conquestZoneOf(params.get("zone"));
  // The zone the scene opens on: the one named, else the viewer's own, else the world's middle.
  const anchor = side === 0 ? null : named !== null && named < side * side ? named : (state.data?.home ?? Math.floor((side * side) / 2));
  // The zone under the middle of the view, as the camera moves; a new anchor starts from it.
  const [focused, setFocused] = useState<{ anchor: number; zone: number } | null>(null);
  const focus = anchor === null ? null : focused && focused.anchor === anchor ? focused.zone : anchor;
  const [view, setView] = useState<"3d" | "grid">(() => (hasWebGL() ? "3d" : "grid"));
  const area = useConquestArea(me, view === "3d" ? focus : null);
  const zone = useConquestZone(me, view === "grid" ? anchor : null);
  const [picked, setPicked] = useState<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<{ x: number; y: number; plan: number; orientation: number } | null>(null);
  const options = useConquestOptions(me, state.data?.leads ? picked : null);
  const [notice, setNotice] = useState<{ title: string; text: string } | null>(null);
  const [world, setWorld] = useState(false);
  // A new scene for the same zone (Back to my zone after a pan): the board is mounted again.
  const [mount, setMount] = useState(0);
  const explore = useExploreConquest(me);
  const request = useRequestConquest(me);
  const give = useGiveConquest(me);
  const tileArt = useTileArt(RENDERER_ASSETS);
  const board = useBoardSettings();
  // The camera opens over the scene's origin (the zone's middle), not on the frame of every tile round it.
  const renderer = useMemo(() => ({ ...board.renderer, cameraFit: { enabled: false } }), [board.renderer]);

  // The scene's origin: the middle of the zone it opened on (its capital, a free zone's Great Wonder).
  const origin = useMemo(() => (anchor === null || side === 0 ? null : { x: (anchor % side) * CONQUEST_PROVINCE + MIDDLE, y: Math.floor(anchor / side) * CONQUEST_PROVINCE + MIDDLE }), [anchor, side]);
  const toBoard = useCallback((c: { x: number; y: number }) => ({ x: CENTER + c.x - origin!.x, y: CENTER + c.y - origin!.y }), [origin]);
  const data = area.data;
  const tiles = useMemo<BoardTile[]>(() => (data && origin ? data.tiles.map((t) => ({ id: t.y * 4096 + t.x + 1, plan: t.plan, orientation: t.orientation, ...toBoard(t) }) as BoardTile) : []), [data, origin, toBoard]);
  const reveal = useMemo(() => (data && origin ? [...data.explored, ...data.tiles].map(toBoard) : []), [data, origin, toBoard]);
  // A plate on each cell that takes an action: a request to give, and for who leads a cell beside the allegiance's tiles.
  const leads = state.data?.leads ?? false;
  const slots = useMemo(() => {
    if (!data || !origin) return [];
    const cells = new Map<string, { x: number; y: number }>();
    for (const c of [...data.requests, ...(leads ? data.frontier : []), ...(picked ? [picked] : [])]) cells.set(`${c.x},${c.y}`, toBoard(c));
    return [...cells.values()];
  }, [data, origin, leads, picked, toBoard]);
  const ghost = useMemo(() => (preview && origin ? { ...toBoard(preview), plan: preview.plan, orientation: preview.orientation, placed: true } : null), [preview, origin, toBoard]);

  // The zone under the middle of the board, read as the camera moves.
  const sceneRef = useRef<GameScene | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const onScene = useCallback(
    (scene: GameScene | null) => {
      sceneRef.current = scene;
    },
    [],
  );
  const [ready, setReady] = useState(0);
  const onSceneReady = useCallback(
    (scene: GameScene | null) => {
      onScene(scene);
      setReady((n) => n + 1);
    },
    [onScene],
  );
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !origin || anchor === null || side === 0) return;
    const read = () => {
      const rect = box.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const at = scene.gridAt({ x: rect.width / 2, y: rect.height / 2 });
      if (!at) return;
      // The renderer's grid: x east, y south of the origin.
      const col = Math.floor((origin.x + at.x) / CONQUEST_PROVINCE);
      const row = Math.floor((origin.y - at.y) / CONQUEST_PROVINCE);
      if (col < 0 || row < 0 || col >= side || row >= side) return;
      const under = row * side + col;
      setFocused((last) => (last && last.anchor === anchor && last.zone === under ? last : { anchor, zone: under }));
    };
    return scene.onCameraChange(read);
  }, [ready, origin, anchor, side]);

  const open = (target: number, again = false) => {
    setPicked(null);
    setPreview(null);
    setNotice(null);
    setWorld(false);
    setFocused(null);
    if (again) setMount((n) => n + 1);
    go(`/conquest?zone=${target}`, { replace: true });
  };
  const done = (title: string, text: string) => {
    setNotice({ title, text });
    setPicked(null);
    setPreview(null);
  };
  const failed = state.error ?? (view === "3d" ? area.error : zone.error);
  return (
    <ConquestMapScene
      state={state.data ?? null}
      area={data ?? null}
      zone={zone.data ?? null}
      focus={focus}
      error={state.unavailable ? "The Conquest is not on this network yet." : (failed?.message ?? null)}
      errorDetail={failed ? errorDetail(failed) : undefined}
      onRetry={state.unavailable ? undefined : state.error ? state.refetch : view === "3d" ? area.refetch : zone.refetch}
      canvas={
        view === "3d" && origin && anchor !== null ? (
          <div ref={box} className="absolute inset-0">
            <BoardCanvas
              key={`${anchor}:${mount}`}
              board={{ renderer, onScene: onSceneReady }}
              tiles={tiles}
              gameId={state.data?.conquest ?? 0}
              reveal={reveal}
              slots={slots}
              otherPlates={false}
              ghost={ghost}
              onCellClick={(slot) => {
                const cell = { x: slot.x - CENTER + origin.x, y: slot.y - CENTER + origin.y };
                setNotice(null);
                setPicked((last) => (last && last.x === cell.x && last.y === cell.y ? null : cell));
              }}
              onError={() => setView("grid")}
            />
          </div>
        ) : undefined
      }
      cell={picked}
      options={options.data ?? null}
      busy={explore.isPending ? "explore" : request.isPending ? "request" : give.isPending ? "give" : null}
      notice={notice}
      world={world}
      tileArt={tileArt}
      onBack={onBack}
      onWorld={setWorld}
      onZone={(target) => open(target)}
      onHome={() => state.data?.home != null && open(state.data.home, true)}
      onCell={(cell) => {
        setNotice(null);
        setPicked(cell);
      }}
      onPreview={setPreview}
      onExplore={(at) => explore.mutate(at, { onSuccess: ({ knowledge }) => done(`+${knowledge} Knowledge`, knowledge >= 40 ? "A rare find! The cell is open for building." : "The cell is explored: it is open for building."), onError: refused })}
      onRequest={(tile) => request.mutate(tile, { onSuccess: () => done("Request posted", "Any member who holds the tile can give it: it is built at once."), onError: refused })}
      onGive={(id) => give.mutate(id, { onSuccess: (given) => done(`Tile built · +${given.cobbles} ${given.cobbles === 1 ? "Cobble" : "Cobbles"}`, `Built in your name. ${given.ordersLeft} ${given.ordersLeft === 1 ? "order" : "orders"} left today.`), onError: refused })}
    />
  );
}
