import { useDojo } from "../../dojo/useDojo";
import { Event, InvokeTransactionReceiptResponse, shortString } from 'starknet';
import { Button } from "@/components/ui/button"
import { useUIStore } from "../../store";
import { useGameIdStore } from "../../store";

export const Initialize = () => {
    const setLoggedIn = useUIStore((state: any) => state.setLoggedIn);
    const setGameId = useGameIdStore((state: any) => state.setGameId);
    const {
        account: { account, isDeploying },
        setup: {
            client,
        },
    } = useDojo();

    const handleClick = async (event: any) => {
      console.log("Initialize");
      event.preventDefault();
      const tx = await client.play.initialize({
        account,
      });
      const receipt = (await account.waitForTransaction(tx.transaction_hash, {
        retryInterval: 100,
      })) as InvokeTransactionReceiptResponse;
      const txEvent = receipt.events.find((event: Event) => shortString.decodeShortString(event.data[0]) === 'Game');
      if (txEvent) {
        const game_id = parseInt(txEvent.data[2], 16);
        setGameId(game_id);
      }
      setLoggedIn();
    }

    return (
        <div className="flex space-x-3 justify-between p-2 flex-wrap" onClick={handleClick}>
          <Button
              variant={"default"}
              onClick={handleClick}
          >
            Initialize
          </Button>
        </div>
    );
};
