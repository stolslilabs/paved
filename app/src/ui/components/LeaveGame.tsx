import { useDojo } from "../../dojo/useDojo";
import { Button } from "@/components/ui/button";
import { useMemo } from "react";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useNavigate } from "react-router-dom";
import { Account } from "starknet";

export const LeaveGame = () => {
  const { gameId } = useQueryParams();

  const {
    account: { account },
    setup: {
      systemCalls: { leave_game },
    },
  } = useDojo();

  const navigate = useNavigate();

  const setGameQueryParam = useMemo(() => {
    return () => {
      navigate("", { replace: true });
    };
  }, [navigate]);

  const handleClick = () => {
    leave_game({
      account: account as Account,
      game_id: gameId,
    });
    setGameQueryParam();
  };

  return (
    <Button variant={"secondary"} onClick={handleClick}>
      Leave
    </Button>
  );
};
