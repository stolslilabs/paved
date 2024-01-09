import { useDojo } from "./hooks/useDojo";
import { Button } from "./button";
import { useUIStore } from "../store";
import { useEffect } from "react";
import { useGameIdStore } from "../store";

export const Initialize = () => {
    const setLoggedIn = useUIStore((state: any) => state.setLoggedIn);
    const setGameId = useGameIdStore((state: any) => state.setGameId);
    const {
        account: { account, isDeploying },
        systemCalls: { initialize },
    } = useDojo();


    useEffect(() => {
        if (isDeploying) {
            return;
        }

        if (account) {
            return;
        }
    }, [account]);

    if (!account) {
        return <div>Deploying...</div>;
    }

    return (
        <div className="flex space-x-3 justify-between p-2 flex-wrap">
            <Button
                variant={"default"}
                onClick={async () => {
                    await initialize({
                        signer: account,
                        setGameId,
                    });

                    setLoggedIn();
                }}
            >
                Initialize
            </Button>
        </div>
    );
};
