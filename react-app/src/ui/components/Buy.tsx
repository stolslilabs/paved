import { Button } from "@/components/ui/button";
import { useDojo } from "../../dojo/useDojo";
import { faCartPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const Buy = ({ show }: { show: boolean }) => {
  const {
    account: { account },
    setup: {
      systemCalls: { buy },
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
        buy({
          account: account,
          amount: 1,
        })
      }
    >
      <FontAwesomeIcon icon={faCartPlus} />
    </Button>
  );
};
