import { useMemo } from "react";
import { useGameStore } from "../../store";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useDojo } from "../../dojo/useDojo";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";

export const Cancel = () => {
  const { gameId } = useQueryParams();
  const {
    account: { account },
    setup: {
      clientComponents: { Builder },
    },
  } = useDojo();

  const {
    resetX,
    resetY,
    resetOrientation,
    resetCharacter,
    resetSpot,
    resetSelectedTile,
    resetHoveredTile,
    resetValid,
  } = useGameStore();

  const builderId = getEntityIdFromKeys([
    BigInt(gameId),
    BigInt(account.address),
  ]) as Entity;
  const builder = useComponentValue(Builder, builderId);

  const handleClick = () => {
    resetOrientation();
    resetX();
    resetY();
    resetCharacter();
    resetSpot();
    resetSelectedTile();
    resetHoveredTile();
    resetValid();
  };

  const disabled = useMemo(() => {
    return !builder?.tile_id;
  }, [builder]);

  if (!account || !builder) return <></>;

  return (
    <Button
      disabled={disabled}
      variant={"command"}
      size={"command"}
      onClick={handleClick}
    >
      <FontAwesomeIcon className="h-12" icon={faXmark} />
    </Button>
  );
};
