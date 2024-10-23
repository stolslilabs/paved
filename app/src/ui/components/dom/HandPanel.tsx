import { IngameButton } from "./IngameButton";
import rotateIcon from "/assets/icons/rotate.svg";
import confirmIcon from "/assets/icons/confirm.svg";
import { Tile } from "../Tile";
import { useActions } from "@/hooks/useActions";
import RotationSound from "/sounds/effects/rotation.wav";
import { useGameStore } from "@/store";
import useSound from "use-sound";
import { useMemo, useCallback } from "react";
import { useTutorial } from "@/hooks/useTutorial";

export const HandPanel = () => {
  const [play] = useSound(RotationSound);
  const { enabled } = useActions();
  const { x, y, spot, character } = useGameStore();
  const { currentTutorialStage } = useTutorial();
  const { orientation, setOrientation } = useGameStore();
  const { handleConfirm, disabled } = useActions();

  const handleRotate = useCallback(() => {
    play();
    setOrientation(orientation + 1);
  }, [play, orientation, setOrientation]);

  const handleConfirmCallback = useCallback(() => {
    handleConfirm();
  }, [handleConfirm]);

  const shouldDisplayConfirmTutorialTooltip = useMemo(() => {
    if (!currentTutorialStage) return false;

    const {
      presetTransaction: {
        x: presetX,
        y: presetY,
        role: presetRole,
        spot: presetSpot,
        orientation: presetOrientation,
      },
    } = currentTutorialStage;

    const hasCoords = x === presetX && y === presetY;
    const hasRole = character === presetRole;
    const hasSpot = spot === presetSpot;
    const hasOrientation = orientation === presetOrientation;

    return hasCoords && hasSpot && hasRole && hasOrientation;
  }, [currentTutorialStage, x, y, character, spot, orientation]);

  const shouldDisplayRotateTutorialTooltip = useMemo(() => {
    if (!currentTutorialStage) return false;

    const {
      presetTransaction: {
        x: presetX,
        y: presetY,
        role: presetRole,
        spot: presetSpot,
        orientation: presetOrientation,
      },
    } = currentTutorialStage;

    const hasCoords = x === presetX && y === presetY;
    const hasRole = character === presetRole;
    const hasSpot = spot === presetSpot;
    const hasOrientation = orientation === presetOrientation;

    return hasCoords && hasSpot && hasRole && !hasOrientation;
  }, [currentTutorialStage, x, y, character, spot, orientation]);

  return (
    <div className="col-start-4 row-start-8 sm:col-start-3 sm:row-start-4 flex flex-row justify-end gap-2 pointer-events-none">
      <div id="tile-controls" className="flex flex-col gap-2 self-center">
        <IngameButton
          id="rotate-button"
          name="Rotate"
          icon={rotateIcon}
          side="left"
          onClick={handleRotate}
          disabled={!enabled}
          tutorialCondition={shouldDisplayRotateTutorialTooltip}
        />
        <IngameButton
          id="confirm-button"
          name="Confirm"
          icon={confirmIcon}
          side="left"
          onClick={handleConfirmCallback}
          disabled={disabled}
          tutorialCondition={shouldDisplayConfirmTutorialTooltip}
        />
      </div>
      <Tile />
    </div>
  );
};
