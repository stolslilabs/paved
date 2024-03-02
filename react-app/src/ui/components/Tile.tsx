import { useEffect, useState, useMemo } from "react";
import { useDojo } from "../../dojo/useDojo";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useGameStore } from "../../store";
import { useQueryParams } from "../../hooks/useQueryParams";
import { getImage } from "../../utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye } from "@fortawesome/free-solid-svg-icons";
import { Spot } from "./Spot";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const Tile = () => {
  const [rotation, setRotation] = useState(0);
  const [backgroundImage, setBackgroundImage] = useState<string>();
  const { gameId } = useQueryParams();
  const { orientation, setActiveEntity, resetActiveEntity } = useGameStore();

  const {
    account: { account },
    setup: {
      clientComponents: { Builder, Tile },
    },
  } = useDojo();

  const builderEntity = useMemo(() => {
    return getEntityIdFromKeys([
      BigInt(gameId),
      BigInt(account.address),
    ]) as Entity;
  }, [gameId, account]);
  const builder = useComponentValue(Builder, builderEntity);

  const tileEntity = useMemo(() => {
    return getEntityIdFromKeys([
      BigInt(gameId),
      BigInt(builder ? builder.tile_id : 0),
    ]) as Entity;
  }, [gameId, builder]);
  const tile = useComponentValue(Tile, tileEntity);

  useEffect(() => {
    if (tile) {
      const image = getImage(tile);
      setBackgroundImage(image);
      setActiveEntity(tileEntity);
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

  if (!account || !builder) return <></>;

  return (
    <div
      className="h-60 w-60 p-5 border-2 border-stone-500 flex justify-center items-center rounded-xl"
      style={{ backgroundColor }}
    >
      {tile && backgroundImage ? (
        <ActiveTile image={backgroundImage} rotation={rotation} />
      ) : (
        <HiddenTile />
      )}
    </div>
  );
};

export const ActiveTile = ({
  image,
  rotation,
}: {
  image: string;
  rotation: number;
}) => {
  const { character } = useGameStore();
  const spots = useMemo(
    () => ["NW", "W", "SW", "N", "C", "S", "NE", "E", "SE"],
    []
  );
  const borderColor = useMemo(() => "#3B3B3B", []);
  return (
    <>
      <div
        className="relative h-full w-full border-8 cursor-pointer"
        style={{
          backgroundImage: `url(${image})`,
          backgroundSize: "cover",
          transform: `rotate(${rotation}deg)`,
          borderColor,
        }}
      />
      <>
        {character !== 0 && (
          <div className="w-full h-full absolute grid grid-rows-3 grid-flow-col justify-items-center items-center">
            {spots.map((_spot, index) => (
              <Spot key={index} index={index} />
            ))}
          </div>
        )}
      </>
    </>
  );
};

export const HiddenTile = () => {
  const { gameId } = useQueryParams();
  const { resetSelectedTile } = useGameStore();

  const {
    account: { account },
    setup: {
      systemCalls: { draw },
    },
  } = useDojo();

  const handleDrawClick = () => {
    resetSelectedTile();
    draw({
      account: account,
      game_id: gameId,
    });
  };

  const backgroundImage = useMemo(() => getImage({ plan: 22 }), []);
  const borderColor = useMemo(() => "#3B3B3B", []);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="h-full w-full border-8 cursor-pointer"
            style={{
              backgroundImage: `url(${backgroundImage})`,
              backgroundSize: "cover",
              borderColor,
            }}
            onClick={handleDrawClick}
          >
            <div className="h-full w-full backdrop-blur-md bg-white/30 flex justify-center items-center ">
              <FontAwesomeIcon className="h-12" icon={faEye} />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Draw a tile</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
