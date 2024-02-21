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
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash, faRocket } from "@fortawesome/free-solid-svg-icons";
import banner from "/assets/banner.svg";

export const Account = () => {
  const {
    account: { account, create, clear, list, select },
  } = useDojo();

  return (
    <div className="flex gap-4">
      <Select
        onValueChange={(value) => select(value)}
        defaultValue={account.address}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select Addr" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {list().map((account, index) => {
              return (
                <div key={index} className="flex">
                  <SelectItem value={account.address}>
                    {shortenHex(account.address)}
                  </SelectItem>
                </div>
              );
            })}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Button variant={"secondary"} size={"icon"} onClick={() => create()}>
        <FontAwesomeIcon icon={faRocket} />
      </Button>

      <Button variant={"secondary"} size={"icon"} onClick={() => clear()}>
        <FontAwesomeIcon icon={faTrash} />
      </Button>
    </div>
  );
};
