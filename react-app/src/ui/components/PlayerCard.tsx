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

import { useDojo } from "@/dojo/useDojo";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";

import { shortString } from "starknet";

import avatar from "/assets/characters/adventurer.png";

export const PlayerCard = () => {
  const [rank, setRank] = useState(0);
  const [score, setScore] = useState(0);
  const [games, setGames] = useState(0);
  const [won, setWon] = useState(0);
  const [paved, setPaved] = useState(0);
  const [identifier, setIdentifier] = useState(0);
  const [playerName, setPlayerName] = useState("Name");

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
      console.log(player);
      setRank(player.rank);
      setScore(player.score);
      setGames(player.games);
      setWon(player.won);
      setPaved(player.paved);
      setIdentifier(player.id);
      setPlayerName(shortString.decodeShortString(player.name));
    }
  }, [player, account]);

  return (
    <Card>
      <div className="flex">
        <CardHeader className="w-3/5">
          <CardTitle className="text-xl">User info</CardTitle>
          <Separator />
          <CardDescription className="pt-2">
            <div className="flex justify-center">
              <div className="text-right flex flex-col gap-4">
                <p>Rank:</p>
                <p>Score:</p>
                <p>Games:</p>
                <p>Won:</p>
                <p>Paved:</p>
              </div>
              <div className="ml-2 text-left flex flex-col gap-4">
                <p>{rank}</p>
                <p>{score}</p>
                <p>{games}</p>
                <p>{won}</p>
                <p>{paved}</p>
              </div>
            </div>
          </CardDescription>
        </CardHeader>
        <CardHeader className="flex flex-col w-2/5 items-center justify-around gap-2">
          <Avatar className="border-2 w-full h-auto rounded-none">
            <AvatarImage src={avatar} alt="avatar" />
            <AvatarFallback>A</AvatarFallback>
          </Avatar>
          <Badge className="w-full">{`ID # ${identifier}`}</Badge>
          <Badge className="w-full">{playerName}</Badge>
        </CardHeader>
      </div>
      <CardContent className="flex flex-col">
        <CardHeader>Achievements</CardHeader>
        <CardContent className="flex gap-2">
          <div className="flex flex-col items-center">
            <img src={avatar} alt="avatar" className="w-8" />
            <Badge>9</Badge>
          </div>
          <div className="flex flex-col items-center">
            <img src={avatar} alt="avatar" className="w-8" />
            <Badge>9</Badge>
          </div>
          <div className="flex flex-col items-center">
            <img src={avatar} alt="avatar" className="w-8" />
            <Badge>9</Badge>
          </div>
          <div className="flex flex-col items-center">
            <img src={avatar} alt="avatar" className="w-8" />
            <Badge>9</Badge>
          </div>
          <div className="flex flex-col items-center">
            <img src={avatar} alt="avatar" className="w-8" />
            <Badge>9</Badge>
          </div>
        </CardContent>
      </CardContent>
    </Card>
  );
};
