import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDojo } from "@/dojo/useDojo";
import { useComponentValue, useEntityQuery } from "@dojoengine/react";
import { Entity, Has } from "@dojoengine/recs";
import { useNavigate } from "react-router-dom";
import { shortString } from "starknet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { getEntityIdFromKeys, shortenHex } from "@dojoengine/utils";
import {
  getLightOrders,
  getDarkOrders,
  getOrderFromName,
  getOrder,
} from "@/utils";
import { faRightToBracket } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import banner from "/assets/banner.svg";
import { Account } from "@/ui/components/Account";
import { PlayerCard } from "@/ui/components/PlayerCard";
import { Spawn } from "@/ui/components/Spawn";

export const Player = () => {
  const {
    account: { account, create, clear, list, select },
    setup: {
      clientComponents: { Game },
      systemCalls: { create_player },
    },
  } = useDojo();

  const backgroundColor = useMemo(() => "#FFF8F8", []);

  return (
    <div className="h-screen w-2/5 flex-col" style={{ backgroundColor }}>
      <div className="h-40 opacity-60">
        <img src={banner} alt="banner" className="h-full" />
      </div>
      <div className="px-10 flex flex-col gap-4">
        <h1 className="text-2xl text-left">Menu</h1>
        <Account />
        <div className="flex justify-center gap-4">
          <Button disabled variant={"secondary"} onClick={() => create()}>
            Shop
          </Button>
          <Button disabled variant={"secondary"} onClick={() => create()}>
            Guide
          </Button>
          <Spawn />
        </div>
        <PlayerCard />
      </div>
    </div>
  );
};
