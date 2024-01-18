import { useDojo } from "../../dojo/useDojo";
import { Event, InvokeTransactionReceiptResponse, shortString } from "starknet";
import { Button } from "@/components/ui/button";
import { useUIStore } from "../../store";
import { useGameIdStore } from "../../store";
import { getEntityComponents } from "@dojoengine/recs";

export const Initialize = () => {
  const setLoggedIn = useUIStore((state: any) => state.setLoggedIn);
  const setGameId = useGameIdStore((state: any) => state.setGameId);
  const {
    account,
    setup: {
      client: { play },
    },
  } = useDojo();

  return (
    <div className="flex space-x-3 justify-between p-2 flex-wrap">
      <Button
        variant={"default"}
        onClick={() =>
          play.initialize({
            account: account.account,
          })
        }
      >
        Initialize
      </Button>
    </div>
  );
};
