import { useEffect, useState, useMemo } from "react";
import {
  offset,
  getCharacterFromIndex,
  getIndexFromCharacter,
  getRole,
  getRoleAllowedSpots,
  getBoost,
  Characters,
} from "@/dojo/game";
import { useCameraStore, useGameStore } from "../../store";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useCharacter } from "@/hooks/useCharacter";
import { useTile } from "@/hooks/useTile";
import { useDojo } from "@/dojo/useDojo";

import pilgrim from "/assets/icons/pilgrim.svg";
import lord from "/assets/icons/lord.svg";
import lady from "/assets/icons/lady.svg";
import adventurer from "/assets/icons/adventurer.svg";
import paladin from "/assets/icons/paladin.svg";
import woodsman from "/assets/icons/woodsman.svg";
import herdsman from "/assets/icons/herdsman.svg";
import { IngameButton } from "./dom/IngameButton";
import { useTutorial } from "@/hooks/useTutorial";

interface TProps {
  index: number;
  enable: boolean;
}

export const Character = (props: TProps) => {
  const { gameId } = useQueryParams();
  const { index, enable } = props;
  const [selected, setSelected] = useState(false);
  const { character, setCharacter, resetCharacter, resetSpot } = useGameStore();
  const { setPosition } = useCameraStore();
  const {
    account: { account },
  } = useDojo();

  const { character: characterModel } = useCharacter({
    gameId,
    playerId: account?.address,
    characterId: getCharacterFromIndex(index),
  });
  const { tile } = useTile({ gameId, tileId: characterModel?.tile_id || 0 });

  useEffect(() => {
    setSelected(index === getIndexFromCharacter(character));
  }, [character]);

  const role = useMemo(() => {
    return getRole(index);
  }, [index]);

  const className = useMemo(
    () => (enable ? "cursor-pointer" : "cursor-zoom-in opacity-25"),
    [selected, enable],
  );

  const spots = useMemo(() => {
    return getRoleAllowedSpots(index);
  }, [index]);

  const handleClick = useMemo(() => {
    return () => {
      if (enable) {
        if (index === getIndexFromCharacter(character)) {
          resetCharacter();
          resetSpot();
        } else {
          setCharacter(getCharacterFromIndex(index));
        }
      } else if (tile) {
        const x = (tile.x - offset) * -3;
        const y = (tile.y - offset) * -3;
        setPosition([x, y, 0]);
      }
    };
  }, [index, character, enable, tile]);

  const characterIcons: { [key: number]: string } = {
    [Characters.Lord]: lord,
    [Characters.Lady]: lady,
    [Characters.Adventurer]: adventurer,
    [Characters.Paladin]: paladin,
    [Characters.Pilgrim]: pilgrim,
    [Characters.Woodsman]: woodsman,
    [Characters.Herdsman]: herdsman,
  };

  const { currentTutorialStage } = useTutorial()
  const { x, y } = useGameStore();

  const shouldDisplayTutorialTooltip = useMemo(() => {
    if (!currentTutorialStage) return false;
    const { presetTransaction: {
      x: presetX,
      y: presetY,
      role: presetRole,
    } } = currentTutorialStage;

    const hasCoords = x === presetX && y === presetY;
    const hasRole = index + 1 === presetRole;
    const isSelected = character === presetRole;

    return hasCoords && hasRole && !isSelected
  }, [currentTutorialStage, x, y, index, character]);

  return (
    <IngameButton
      id={`${role.toLowerCase()}-button`}
      className={`pointer-events-auto aspect-square select-none p-2.5 ${className}`}
      variant={selected ? "character_selected" : "character"}
      name={role}
      onClick={handleClick}
      icon={characterIcons[index]}
      tutorialCondition={shouldDisplayTutorialTooltip}
    />
  );
};

export const Spot = (props: { spot: string; index: number }) => {
  const { spot, index } = props;

  const color = useMemo(() => {
    switch (spot) {
      case "C":
        return "bg-orange-700";
      case "R":
        return "bg-yellow-400";
      case "F":
        return "bg-lime-300";
      case "W":
        return "bg-stone-400";
      default:
        return "bg-white";
    }
  }, [spot]);

  const ringColor = useMemo(() => {
    switch (spot) {
      case "F":
        switch (index) {
          case 5:
            return "ring-yellow-400";
          case 6:
            return "ring-orange-700";
          default:
            return "border-white";
        }
      default:
        return "ring-white";
    }
  }, [spot, index]);

  const boosted = useMemo(() => {
    return getBoost(index) === spot;
  }, [index]);

  return (
    <div
      className={`h-2 w-2 rounded-full ${color} ${ringColor} ${boosted ? "ring-2" : "ring-0"
        }`}
    />
  );
};
