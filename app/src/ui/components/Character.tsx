import { useEffect, useState, useMemo } from "react";
import {
  offset,
  getCharacterImage,
  getCharacterFromIndex,
  getIndexFromCharacter,
  getRole,
  getRoleAllowedSpots,
  getBoost,
} from "@/dojo/game";
import { useCameraStore, useGameStore } from "../../store";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useDojo } from "@/dojo/useDojo";
import { useCharacter } from "@/hooks/useCharacter";
import { useTile } from "@/hooks/useTile";

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
    playerId: account.address,
    characterId: getCharacterFromIndex(index),
  });
  const { tile } = useTile({ gameId, tileId: characterModel?.tile_id || 0 });

  useEffect(() => {
    setSelected(index === getIndexFromCharacter(character));
  }, [character]);

  const image = useMemo(() => {
    return getCharacterImage(index + 1);
  }, [index]);

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

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className={`pointer-events-auto select-none ${className}`}
            variant={selected ? "character_selected" : "character"}
            size={"character"}
            onClick={handleClick}
          >
            <img
              draggable={false}
              className="h-6 md:h-16"
              src={image}
              alt={getRole(index)}
            />
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
      className={`h-2 w-2 rounded-full ${color} ${ringColor} ${
        boosted ? "ring-2" : "ring-0"
      }`}
    />
  );
};
