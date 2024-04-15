import { useEffect, useState, useMemo } from "react";
import { useStarkProfile } from "@starknet-react/core";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import BoringAvatar from "boring-avatars";

import { useDojo } from "@/dojo/useDojo";
import { shortenHex } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { getAvatar } from "@/utils/avatar";
import { getColor } from "@/dojo/game";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChessKnight,
  faChessRook,
  faDove,
  faDragon,
  faHammer,
  faPlaceOfWorship,
  faTrophy,
  faUsers,
  faUserSecret,
} from "@fortawesome/free-solid-svg-icons";
import { usePlayerByKey } from "@/hooks/usePlayer";

export const PlayerCard = ({ playerId }: { playerId: Entity }) => {
  const [score, setScore] = useState<number>();
  const [paved, setPaved] = useState<number>();
  const [bank, setBank] = useState<number>();
  const [identifier, setIdentifier] = useState<string>("");
  const [playerName, setPlayerName] = useState<string>("Name");
  const [avatar, setAvatar] = useState<string | null | undefined>();

  const { player } = usePlayerByKey({ playerKey: playerId });

  const address = useMemo(() => player?.master, [player]);
  const { data } = useStarkProfile({ address });

  useEffect(() => {
    console.log(player);
    if (player) {
      setScore(player.score);
      setPaved(player.paved);
      setBank(player.bank);
      setIdentifier(
        shortenHex(`0x${player.id.toString(16)}`).replace("...", ""),
      );
      setPlayerName(player.name);
    } else {
      setScore(undefined);
      setPaved(undefined);
      setBank(undefined);
      setIdentifier("");
      setPlayerName("");
      setAvatar(undefined);
    }
  }, [player]);

  useEffect(() => {
    if (!address) setAvatar(undefined);
    (async () => {
      const avatar = await getAvatar(data);
      setAvatar(avatar);
    })();
  }, [data, address]);

  const borderColor = useMemo(() => "#B8D8D8", []);
  const backgroundColor = useMemo(() => "#EAEFEF", []);

  return (
    <Card className="border-4" style={{ backgroundColor, borderColor }}>
      <div className="flex">
        <CardHeader className="flex flex-col w-3/5">
          <CardTitle className="text-xl">User info</CardTitle>
          <Separator
            className="h-0.5"
            style={{ backgroundColor: borderColor }}
          />
          <div className="flex flex-col gap-8">
            <PlayerInfo score={score} paved={paved} />
            <TileBank bank={bank} />
          </div>
        </CardHeader>
        <CardHeader className="flex flex-col w-2/5 items-center justify-around gap-2">
          <PlayerAvatar
            avatar={identifier ? avatar : undefined}
            address={`0x${player?.id.toString(16)}`}
          />
          <PlayerId identifier={identifier} />
          <PlayerName playerName={playerName} />
        </CardHeader>
      </div>
      <CardContent className="flex flex-col">
        <h5>Achievements</h5>
        <ul className="flex gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <li className="flex flex-col items-center gap-2">
                  <FontAwesomeIcon icon={faChessKnight} />
                  <Badge variant={"secondary"}>0</Badge>
                </li>
              </TooltipTrigger>
              <TooltipContent>
                <p className="select-none">Coming soon</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <li className="flex flex-col items-center gap-2">
                  <FontAwesomeIcon icon={faHammer} />
                  <Badge variant={"secondary"}>0</Badge>
                </li>
              </TooltipTrigger>
              <TooltipContent>
                <p className="select-none">Coming soon</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <li className="flex flex-col items-center gap-2">
                  <FontAwesomeIcon icon={faUserSecret} />
                  <Badge variant={"secondary"}>0</Badge>
                </li>
              </TooltipTrigger>
              <TooltipContent>
                <p className="select-none">Coming soon</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <li className="flex flex-col items-center gap-2">
                  <FontAwesomeIcon icon={faChessRook} />
                  <Badge variant={"secondary"}>0</Badge>
                </li>
              </TooltipTrigger>
              <TooltipContent>
                <p className="select-none">Coming soon</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <li className="flex flex-col items-center gap-2">
                  <FontAwesomeIcon icon={faDragon} />
                  <Badge variant={"secondary"}>0</Badge>
                </li>
              </TooltipTrigger>
              <TooltipContent>
                <p className="select-none">Coming soon</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <li className="flex flex-col items-center gap-2">
                  <FontAwesomeIcon icon={faPlaceOfWorship} />
                  <Badge variant={"secondary"}>0</Badge>
                </li>
              </TooltipTrigger>
              <TooltipContent>
                <p className="select-none">Coming soon</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <li className="flex flex-col items-center gap-2">
                  <FontAwesomeIcon icon={faTrophy} />
                  <Badge variant={"secondary"}>0</Badge>
                </li>
              </TooltipTrigger>
              <TooltipContent>
                <p className="select-none">Coming soon</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <li className="flex flex-col items-center gap-2">
                  <FontAwesomeIcon icon={faUsers} />
                  <Badge variant={"secondary"}>0</Badge>
                </li>
              </TooltipTrigger>
              <TooltipContent>
                <p className="select-none">Coming soon</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <li className="flex flex-col items-center gap-2">
                  <FontAwesomeIcon icon={faDove} />
                  <Badge variant={"secondary"}>0</Badge>
                </li>
              </TooltipTrigger>
              <TooltipContent>
                <p className="select-none">Coming soon</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </ul>
      </CardContent>
    </Card>
  );
};

const PlayerInfo = ({ score, paved }: any) => {
  return (
    <CardDescription className="pt-2">
      <div className="flex justify-center">
        <div className="text-right flex flex-col gap-4 w-2/5">
          <p className="h-4">Rank:</p>
          <p className="h-4">Score:</p>
          <p className="h-4">Paved:</p>
        </div>
        <div className="ml-2 text-left flex flex-col gap-4 w-3/5">
          <Skeleton className="h-4 w-16" />
          {score !== undefined ? (
            <p className="h-4">{score}</p>
          ) : (
            <Skeleton className="h-4 w-28" />
          )}
          {paved !== undefined ? (
            <p className="h-4">{paved}</p>
          ) : (
            <Skeleton className="h-4 w-28" />
          )}
        </div>
      </div>
    </CardDescription>
  );
};

const TileBank = ({ bank }: any) => {
  return (
    <Badge
      className="flex justify-center border-dashed border-slate-400 rounded-none"
      variant={"secondary"}
    >
      <div className="text-right flex flex-col gap-4 w-2/3">
        <p>Tile bank:</p>
      </div>
      <div className="ml-2 text-left flex flex-col gap-4 w-1/3">
        {bank ? <p>{bank}</p> : <Skeleton className="h-4 w-12" />}
      </div>
    </Badge>
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

const PlayerId = ({ identifier }: any) => {
  return (
    <Badge className="w-full flex justify-center" variant={"secondary"}>
      <p className="w-1/2">ID #</p>
      {identifier ? <p>{identifier}</p> : <Skeleton className="h-4 w-20" />}
    </Badge>
  );
};

const PlayerName = ({ playerName }: any) => {
  return (
    <Badge className="w-full flex justify-center" variant={"secondary"}>
      {playerName ? <p>{playerName}</p> : <Skeleton className="h-4 w-24" />}
    </Badge>
  );
};
