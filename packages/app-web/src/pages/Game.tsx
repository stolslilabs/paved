import { useCallback, useState } from "react";
import { GameCanvas } from "@paved/renderer/react";
import {
  IngameStatus,
  HandPanel,
  GameCompleteDialog,
  CharacterMenu,
  useGameStore,
} from "@paved/ui";
import type { GameScene } from "@paved/renderer";

export function GamePage() {
  const [scene, setScene] = useState<GameScene | null>(null);
  const orientation = useGameStore((s) => s.orientation);
  const setOrientation = useGameStore((s) => s.setOrientation);
  const strategyMode = useGameStore((s) => s.strategyMode);

  const handleReady = useCallback((s: GameScene) => {
    setScene(s);
  }, []);

  const handleRotate = useCallback(() => {
    setOrientation(orientation + 1);
  }, [orientation, setOrientation]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* 3D Canvas */}
      <GameCanvas
        basePath=""
        strategyMode={strategyMode}
        onReady={handleReady}
        style={{ position: "absolute", inset: 0 }}
      />

      {/* HUD Overlays */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: "none",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gridTemplateRows: "auto 1fr auto",
          padding: 16,
          gap: 8,
        }}
      >
        {/* Top-left: Status */}
        <div style={{ pointerEvents: "auto", gridColumn: 1, gridRow: 1 }}>
          <IngameStatus score={0} built={0} totalTiles={72} discarded={0} />
        </div>

        {/* Right: Character menu */}
        <div style={{ pointerEvents: "auto", gridColumn: 3, gridRow: "1 / -1", alignSelf: "center" }}>
          <CharacterMenu
            packedCharacters={0}
            selectedCharacter={0}
            onSelectCharacter={(c) => useGameStore.getState().setCharacter(c)}
          />
        </div>

        {/* Bottom-right: Hand panel */}
        <div style={{ pointerEvents: "auto", gridColumn: 3, gridRow: 3 }}>
          <HandPanel
            onRotate={handleRotate}
            onConfirm={() => console.log("Confirm")}
          />
        </div>
      </div>

      {/* Game Complete Dialog */}
      <GameCompleteDialog
        score={0}
        visible={false}
        onClose={() => {}}
      />
    </div>
  );
}
