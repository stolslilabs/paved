import { Button } from "@/components/ui/button";
import { useDojo } from "../../dojo/useDojo";
import { faCartPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const Buy = () => {
  const {
    account: { account },
    setup: {
      systemCalls: { buy },
    },
  } = useDojo();

  return (
    <Button
      variant={"command"}
      size={"command"}
      onClick={() =>
        buy({
          account: account,
          amount: 1,
        })
      }
    >
      <FontAwesomeIcon className="h-12" icon={faCartPlus} />
    </Button>
  );
};
