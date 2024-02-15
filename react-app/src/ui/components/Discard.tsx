import { useMemo } from "react";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useDojo } from "../../dojo/useDojo";
import { useQueryParams } from "@/hooks/useQueryParams";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFire } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";

interface TProps {}

export const Discard = (props: TProps) => {
  const { gameId } = useQueryParams();
  const {
    account: { account },
    setup: {
      client: { play },
      clientComponents: { Builder },
    },
  } = useDojo();

  const builderId = getEntityIdFromKeys([
    BigInt(gameId),
    BigInt(account.address),
  ]) as Entity;
  const builder = useComponentValue(Builder, builderId);

  const disabled = useMemo(() => {
    return !builder?.tile_id;
  }, [builder]);

  return (
    <Button
      disabled={disabled}
      variant={"default"}
      size={"icon"}
      onClick={() =>
        play.discard({
          account: account,
          game_id: gameId,
        })
      }
    >
      <FontAwesomeIcon icon={faFire} />
    </Button>
  );
};
