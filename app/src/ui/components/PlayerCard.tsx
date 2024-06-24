import { useMemo } from "react";
import { useStarkProfile } from "@starknet-react/core";
import { Card, CardDescription } from "@/ui/elements/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/ui/elements/avatar";
import { Skeleton } from "@/ui/elements/skeleton";
import BoringAvatar from "boring-avatars";

import { useBalance } from "@/hooks/useBalance";
import { Entity } from "@dojoengine/recs";
import { getColor } from "@/dojo/game";
import { usePlayerByKey } from "@/hooks/usePlayer";
import { Lords } from "./Lords";
import adventurer from "/assets/icons/adventurer.svg";

export const PlayerCard = ({ playerId }: { playerId: Entity }) => {
  const { player } = usePlayerByKey({ playerKey: playerId });

  const address = useMemo(() => player?.master, [player]);
  const { data } = useStarkProfile({ address });
  const { balance } = useBalance({ address: player?.id });

  if (!player) return null;

  return (
    <Card className="border">
      <div className="flex p-4 justify-center gap-8">
        <img src={adventurer} className="h-24 fill-primary" />
        <div>
          <PlayerName playerName={player.name} />
          <PlayerInfo balance={balance} />
        </div>
      </div>
    </Card>
  );
};

const PlayerInfo = ({ balance }: any) => {
  return (
    <div className="pt-2 w-full">
      <div className=" items-center justify-center gap-2 text-xl flex w-full">
        <div className="flex space-x-2">
          {!!balance && <div>{`${balance}`.slice(0, 6)}</div>}
          {!balance && <Skeleton className="h-4 w-12" />}
          <Lords fill="black" width={4} height={4} />
        </div>
      </div>
    </div>
  );
};

const PlayerAvatar = ({ avatar, address }: any) => {
  const borderColor = getColor(address);
  return avatar ? (
    <Avatar className="w-[140px] h-[140px] border-4" style={{ borderColor }}>
      <AvatarImage src={avatar} alt="avatar" />
      <AvatarFallback> </AvatarFallback>
    </Avatar>
  ) : avatar === null ? (
    <BoringAvatar size={140} colors={[borderColor]} />
  ) : (
    <Skeleton className="w-[140px] h-[140px]" />
  );
};

const PlayerName = ({ playerName }: any) => {
  return (
    <div className="flex gap-2">
      {playerName ? <h4>{playerName}</h4> : <Skeleton className="h-4 w-24" />}
    </div>
  );
};
