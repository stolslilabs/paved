import { Card } from "@/ui/elements/card";
import { Skeleton } from "@/ui/elements/skeleton";
import { useBalance } from "@/hooks/useBalance";
import { Entity } from "@dojoengine/recs";
import { usePlayerByKey } from "@/hooks/usePlayer";
import adventurer from "/assets/icons/adventurer.svg";

export const PlayerCard = ({ playerId }: { playerId: Entity }) => {
  const { player } = usePlayerByKey({ playerKey: playerId });

  const { balance } = useBalance({ address: player?.id });

  if (!player) return null;

  return (
    <Card className="border">
      <div className="flex p-2 lg:p-4 justify-center gap-8">
        <img src={adventurer} className="h-24 sm:h-12 lg:h-24 fill-primary" />
        <div className="justify-self-center self-center">
          <PlayerName playerName={player.name} />
          <PlayerInfo balance={balance} />
        </div>
      </div>
    </Card>
  );
};

const PlayerInfo = ({ balance }: { balance: number }) => {
  return (
    <div className="flex text-muted-foreground items-center justify-center text-xl sm:text-base lg:text-xl w-full">
      {!!balance && <div>{`${balance}`.slice(0, 6)}</div>}
      {!balance && <Skeleton className="h-4 w-12" />}L
    </div>
  );
};

const PlayerName = ({ playerName }: { playerName: string }) => {
  return (
    <div className="flex gap-2">
      {playerName ? (
        <h4 className="text-foreground leading-3 sm:leading-none lg:leading-3 sm:text-lg lg:text-xl my-2 sm:my-0 lg:my-2">
          {playerName}
        </h4>
      ) : (
        <Skeleton className="h-4 w-24" />
      )}
    </div>
  );
};
