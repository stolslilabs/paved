import { useEffect, useState, useMemo, useCallback } from "react";
import { useGameStore } from "../../store";
import { useQueryParams } from "../../hooks/useQueryParams";
import { getImage } from "@/dojo/game";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLock } from "@fortawesome/free-solid-svg-icons";
import { Spot } from "./Spot";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/ui/elements/tooltip";
import { useGame } from "@/hooks/useGame";
import { useBuilder } from "@/hooks/useBuilder";
import { useTile } from "@/hooks/useTile";
import { useActions } from "@/hooks/useActions";
import { Loader } from "@/ui/components/Loader";
import { useDojo } from "@/dojo/useDojo";
import { useTutorial } from "@/hooks/useTutorial";
import { ModeType } from "@/dojo/game/types/mode";

export const Tile = () => {
  const [rotation, setRotation] = useState(0);
  const [backgroundImage, setBackgroundImage] = useState<string>();
  const { enabled } = useActions();
  const { gameId } = useQueryParams();
  const { orientation, setOrientation, setActiveEntity, resetActiveEntity } =
    useGameStore();
  const {
    account: { account },
  } = useDojo();

  const { game } = useGame({ gameId });
  const { builder } = useBuilder({ gameId, playerId: account?.address });
  const { tileKey, model: tile } = useTile({
    gameId,
    tileId: builder?.tile_id || 0,
  });

  const { currentTutorialStage } = useTutorial();

  useEffect(() => {
    if (tile) {
      const image = getImage(tile);
      setBackgroundImage(image);
      setActiveEntity(tileKey);
    } else {
      const image = getImage(1);
      setBackgroundImage(image);
      resetActiveEntity();
    }
  }, [tile]);

  useEffect(() => {
    switch (orientation) {
      case 1:
        setRotation(0);
        break;
      case 2:
        setRotation(90);
        break;
      case 3:
        setRotation(180);
        break;
      case 4:
        setRotation(270);
        break;
      default:
        setRotation(0);
    }
  }, [orientation]);

  const backgroundColor = useMemo(() => "#C2B0B7", []);

  const isLoading = useMemo(
    () => (!tile || !backgroundImage) && !game?.isOver(),
    [tile, backgroundImage, game],
  );
  const isLocked = useMemo(() => game?.isOver(), [game]);

  const { x, y, spot, character } = useGameStore();

  const shouldDisplayTutorialTooltip = useMemo(() => {
    if (!currentTutorialStage) return false;

    const {
      presetTransaction: {
        x: presetX,
        y: presetY,
        role: presetRole,
        spot: presetSpot,
      },
    } = currentTutorialStage;

    const hasCoords = x === presetX && y === presetY;
    const hasRole = character === presetRole;
    const hasSpot = spot !== presetSpot;

    return hasCoords && hasSpot && hasRole;
  }, [currentTutorialStage, spot, x, y, character]);

  const id = "tile-preview";

  const interactionText = currentTutorialStage?.interactionText?.get(id);

  const tutorialOpen =
    game?.mode.value === ModeType.Tutorial && interactionText;

  useEffect(() => {
    if (tutorialOpen) {
      setOrientation(currentTutorialStage?.initialOrientation ?? 1);
    }
  }, [tile]);

  if (!account || !game || !builder) return <></>;

  return (
    <Tooltip open={!!tutorialOpen && shouldDisplayTutorialTooltip}>
      <TooltipTrigger asChild>
        <div
          id={id}
          className="relative aspect-square h-full cursor-pointer bg-cover bg-center flex lg:justify-center items-center shadow-lg pointer-events-auto"
          style={{ backgroundColor }}
        >
          {!!tile && backgroundImage && !game?.isOver() && enabled && (
            <ActiveTile
              image={backgroundImage}
              rotation={rotation}
              orientation={orientation}
            />
          )}
          {isLoading && <LoadingTile />}
          {isLocked && <LockedTile />}
        </div>
      </TooltipTrigger>
      <TooltipContent
        asChild
        align="start"
        className="select-none sm:bg-transparent max-w-[200px] sm:max-w-full whitespace-normal text-center sm:text-start"
      >
        <p>{interactionText}</p>
      </TooltipContent>
    </Tooltip>
  );
};

export const ActiveTile = ({
  image,
  rotation,
  orientation,
}: {
  image: string;
  rotation: number;
  orientation: number;
}) => {
  const { character } = useGameStore();
  const spots = useMemo(
    () => ["NW", "W", "SW", "N", "C", "S", "NE", "E", "SE"],
    [],
  );

  const getRotatedIndex = useCallback(
    (index: number) => {
      // Anti rotate the index accordingly to the orientation
      switch (orientation) {
        case 1:
          return index;
        case 2:
          switch (index) {
            case 0:
              return 6;
            case 1:
              return 3;
            case 2:
              return 0;
            case 3:
              return 7;
            case 5:
              return 1;
            case 6:
              return 8;
            case 7:
              return 5;
            case 8:
              return 2;
            default:
              return index;
          }
        case 3:
          switch (index) {
            case 0:
              return 8;
            case 1:
              return 7;
            case 2:
              return 6;
            case 3:
              return 5;
            case 5:
              return 3;
            case 6:
              return 2;
            case 7:
              return 1;
            case 8:
              return 0;
            default:
              return index;
          }
        case 4:
          switch (index) {
            case 0:
              return 2;
            case 1:
              return 5;
            case 2:
              return 8;
            case 3:
              return 1;
            case 5:
              return 7;
            case 6:
              return 0;
            case 7:
              return 3;
            case 8:
              return 6;
            default:
              return index;
          }
        default:
          return index;
      }
    },
    [orientation],
  );

  return (
    <div
      id="tile-preview"
      className="relative h-full w-full cursor-pointer bg-cover"
      style={{
        backgroundImage: `url(${image})`,
        transform: `rotate(${rotation}deg)`,
      }}
    >
      {character !== 0 && (
        <div className="w-full h-full p-0 absolute grid grid-rows-3 grid-flow-col justify-items-center items-center">
          {spots.map((_spot, index) => (
            <Spot key={index} index={getRotatedIndex(index)} />
          ))}
        </div>
      )}
    </div>
  );
};

export const LoadingTile = () => {
  const backgroundImage = useMemo(() => getImage({ plan: 9 }), []);

  return (
    <div
      className={`h-full w-full`}
      style={{
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: "cover",
      }}
    >
      <div className="relative h-full w-full backdrop-blur-md bg-white/30 flex justify-center items-center ">
        <Loader />
      </div>
    </div>
  );
};

export const LockedTile = () => {
  const backgroundImage = useMemo(() => getImage({ plan: 9 }), []);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`h-full w-full border-4`}
          style={{
            backgroundImage: `url(${backgroundImage})`,
            backgroundSize: "cover",
          }}
        >
          <div className="relative h-full w-full backdrop-blur-md bg-white/30 flex justify-center items-center ">
            <FontAwesomeIcon className="h-6 md:h-12" icon={faLock} />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="select-none">Game is over</p>
      </TooltipContent>
    </Tooltip>
  );
};
