import { useDojo } from "./hooks/useDojo";
import { Button } from "./button";
import { useEffect } from "react";
import { useGameIdStore } from "../store";

export const Buy = () => {
    const gameId = useGameIdStore((state: any) => state.gameId);
    const {
        account: { account, isDeploying },
        systemCalls: { buy },
    } = useDojo();

    useEffect(() => {
        if (isDeploying) {
            return;
        }

        if (account) {
            return;
        }
    }, [account]);

    if (!account) return <></>;

    return (
        <div className="flex space-x-3 justify-between p-2 flex-wrap">
            <Button
                variant={"default"}
                onClick={async () => {
                    await buy({
                        signer: account,
                        game_id: gameId,
                    });
                }}
            >
                Draw
            </Button>
        </div>
    );
};
