import { useDojo } from "../../dojo/useDojo";

import { Button } from "@/components/ui/button";

import { useMemo } from "react";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useNavigate } from "react-router-dom";
import { useGame } from "@/hooks/useGame";
import { useBuilder } from "@/hooks/useBuilder";
import { Account } from "starknet";

export const DeleteGame = () => {
  const { gameId } = useQueryParams();

  const {
    account: { account },
    setup: {
      systemCalls: { delete_game },
    },
  } = useDojo();

  const navigate = useNavigate();

  const setGameQueryParam = useMemo(() => {
    return () => {
      navigate("", { replace: true });
    };
  }, [navigate]);

  const { game } = useGame({ gameId });
  const { builder } = useBuilder({
    gameId: gameId,
    playerId: account?.address,
  });

  const disabled = useMemo(() => {
    return (
      !game ||
      !builder ||
      !builder.order ||
      game.player_count !== 1 ||
      builder.index !== 0
    );
  }, [game, builder]);

  const handleClick = () => {
    delete_game({
      account: account as Account,
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
