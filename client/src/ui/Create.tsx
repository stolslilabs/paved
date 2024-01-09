import { useDojo } from "./hooks/useDojo";
import { Button } from "./button";
import { useEffect } from "react";
import { useGameIdStore } from "../store";

interface TProps {
    name: string;
    order: number;
}

export const Create = (props: TProps) => {
    const gameId = useGameIdStore((state: any) => state.gameId);
    const {
        account: { account, isDeploying },
        systemCalls: { create },
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
                    await create({
                        signer: account,
                        game_id: gameId,
                        name: props.name,
                        order: props.order,
                    });
                }}
            >
                Create
            </Button>
        </div>
    );
};
