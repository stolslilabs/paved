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
import { Button } from "@/ui/elements/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/elements/tooltip";
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

  const characterIcons: { [key: number]: JSX.Element } = {
    [Characters.Lord]: (
      <img src={lord} className="w-4 lg:w-6 fill-primary-foreground" />
    ),
    [Characters.Lady]: (
      <img src={lady} className="w-4 lg:w-6 fill-primary-foreground" />
    ),
    [Characters.Adventurer]: (
      <img src={adventurer} className="w-4 lg:w-6 fill-primary-foreground" />
    ),
    [Characters.Paladin]: (
      <img src={paladin} className="w-4 lg:w-6 fill-primary-foreground" />
    ),
    [Characters.Pilgrim]: (
      <img src={pilgrim} className="w-4 lg:w-6 fill-primary-foreground" />
    ),
    [Characters.Woodsman]: (
      <img src={woodsman} className="w-4 lg:w-6 fill-primary-foreground" />
    ),
    [Characters.Herdsman]: (
      <img src={herdsman} className="w-4 lg:w-6 fill-primary-foreground" />
    ),
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className={`pointer-events-auto select-none p-2 sm:p-0 ${className}`}
            variant={selected ? "character_selected" : "character"}
            size={"character"}
            onClick={handleClick}
          >
            {characterIcons[index]}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col justify-center items-center gap-1">
            <div className="select-none">{role}</div>
            <div className="flex justify-center items-center gap-2">
              {spots.map((spot, idx) => (
                <Spot key={idx} spot={spot} index={index} />
              ))}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
