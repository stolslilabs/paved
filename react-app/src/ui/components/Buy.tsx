import { Button } from "@/components/ui/button";
import { useDojo } from "../../dojo/useDojo";
import { faCartPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQueryParams } from "@/hooks/useQueryParams";

export const Buy = ({ show }: { show: boolean }) => {
  const { gameId } = useQueryParams();
  const {
    account,
    setup: {
      client: { play },
    },
  } = useDojo();

  return (
    <Button
      className={`${
        show ? "opacity-100" : "opacity-0 -mb-16"
      } transition-all duration-200`}
      variant={"default"}
      size={"icon"}
      onClick={() =>
        play.buy({
          account: account.account,
          game_id: gameId,
        })
      }
    >
      <FontAwesomeIcon icon={faCartPlus} />
    </Button>
  );
};
