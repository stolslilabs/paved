import { useEffect, useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

import { useDojo } from "@/dojo/useDojo";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys, shortenHex } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";

import { shortString } from "starknet";

import image from "/assets/loaf.svg";
import adventurer from "/assets/characters/adventurer.png";

export const PlayerCard = () => {
  const [rank, setRank] = useState<number | undefined>();
  const [score, setScore] = useState<number | undefined>();
  const [games, setGames] = useState<number | undefined>();
  const [won, setWon] = useState<number | undefined>();
  const [paved, setPaved] = useState<number | undefined>(0);
  const [bank, setBank] = useState<number | undefined>();
  const [avatar, setAvatar] = useState<string>("");
  const [identifier, setIdentifier] = useState<string>("");
  const [playerName, setPlayerName] = useState<string>("Name");

  const {
    account: { account },
    setup: {
      clientComponents: { Player },
    },
  } = useDojo();

  const playerId = useMemo(
    () => getEntityIdFromKeys([BigInt(account.address)]) as Entity,
    [account]
  );
  const player = useComponentValue(Player, playerId);

  useEffect(() => {
    if (player) {
      setRank(player.rank);
      setScore(player.score);
      setGames(player.games);
      setWon(player.won);
      setPaved(player.paved);
      setBank(player.tile_remaining);
      setAvatar(image);
      setIdentifier(shortenHex(`${player.id}`).replace("...", ""));
      setPlayerName(shortString.decodeShortString(player.name));
    } else {
      setRank(undefined);
      setScore(undefined);
      setGames(undefined);
      setWon(undefined);
      setPaved(undefined);
      setBank(undefined);
      setAvatar("");
      setIdentifier("");
      setPlayerName("");
    }
  }, [player, account]);

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
            <PlayerInfo
              rank={rank}
              score={score}
              games={games}
              won={won}
              paved={paved}
            />
            <TileBank bank={bank} />
          </div>
        </CardHeader>
        <CardHeader className="flex flex-col w-2/5 items-center justify-around gap-2">
          <PlayerAvatar avatar={avatar} />
          <PlayerId identifier={identifier} />
          <PlayerName playerName={playerName} />
        </CardHeader>
      </div>
      <CardContent className="flex flex-col">
        <h5>Achievements</h5>
        <ul className="flex gap-2">
          <li className="flex flex-col items-center">
            <img src={adventurer} alt="avatar" className="w-8" />
            <Badge variant={"secondary"}>9</Badge>
          </li>
          <li className="flex flex-col items-center">
            <img src={adventurer} alt="avatar" className="w-8" />
            <Badge variant={"secondary"}>9</Badge>
          </li>
          <li className="flex flex-col items-center">
            <img src={adventurer} alt="avatar" className="w-8" />
            <Badge variant={"secondary"}>9</Badge>
          </li>
          <li className="flex flex-col items-center">
            <img src={adventurer} alt="avatar" className="w-8" />
            <Badge variant={"secondary"}>9</Badge>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
};

const PlayerInfo = ({ rank, score, games, won, paved }: any) => {
  return (
    <CardDescription className="pt-2">
      <div className="flex justify-center">
        <div className="text-right flex flex-col gap-4 w-2/5">
          <p className="h-4">Rank:</p>
          <p className="h-4">Score:</p>
          <p className="h-4">Games:</p>
          <p className="h-4">Won:</p>
          <p className="h-4">Paved:</p>
        </div>
        <div className="ml-2 text-left flex flex-col gap-4 w-3/5">
          {rank ? (
            <p className="h-4">{rank}</p>
          ) : (
            <Skeleton className="h-4 w-16" />
          )}
          {score ? (
            <p className="h-4">{score}</p>
          ) : (
            <Skeleton className="h-4 w-28" />
          )}
          {games ? (
            <p className="h-4">{games}</p>
          ) : (
            <Skeleton className="h-4 w-20" />
          )}
          {won ? (
            <p className="h-4">{won}</p>
          ) : (
            <Skeleton className="h-4 w-16" />
          )}
          {paved ? (
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

const PlayerAvatar = ({ avatar }: any) => {
  return avatar ? (
    <Avatar className="w-[140px] h-[140px] rounded-none">
      <AvatarImage src={avatar} alt="avatar" />
      <AvatarFallback>A</AvatarFallback>
    </Avatar>
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
