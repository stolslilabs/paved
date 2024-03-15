import { useDojo } from "../../dojo/useDojo";

import { Button } from "@/components/ui/button";

import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useComponentValue } from "@dojoengine/react";
import { useMemo } from "react";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useNavigate } from "react-router-dom";

export const DeleteGame = () => {
  const { gameId } = useQueryParams();

  const {
    account: { account },
    setup: {
      clientComponents: { Game, Builder },
      systemCalls: { delete_game },
    },
  } = useDojo();

  const navigate = useNavigate();

  const setGameQueryParam = useMemo(() => {
    return () => {
      navigate("", { replace: true });
    };
  }, [navigate]);

  const gameKey = useMemo(
    () => getEntityIdFromKeys([BigInt(gameId)]),
    [gameId]
  );
  const game = useComponentValue(Game, gameKey);
  const builderKey = useMemo(
    () => getEntityIdFromKeys([BigInt(gameId), BigInt(account.address)]),
    [gameId, account]
  );
  const builder = useComponentValue(Builder, builderKey);

  const disabled = useMemo(() => {
    return (
      !game ||
      !builder ||
      !builder.order ||
      game.player_count !== 1 ||
      game.host !== builder.player_id
    );
  }, [game, builder]);

  const handleClick = () => {
    delete_game({
      account: account,
      game_id: gameId,
    });
    setGameQueryParam();
  };

  return (
    <Button disabled={disabled} variant={"secondary"} onClick={handleClick}>
      Delete
    </Button>
  );
};
