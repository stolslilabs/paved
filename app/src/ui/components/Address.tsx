import { useAccount, useStarkProfile } from "@starknet-react/core";
import { useEffect, useMemo, useState } from "react";
import { getAvatar } from "@/utils/avatar";
import useClipboard from "react-use-clipboard";
import { Button } from "../elements/button";

export function minifyAddressOrStarknetId(
  address: string | undefined,
  starknetId: string | undefined,
) {
  const input = starknetId !== undefined ? starknetId : address;
  if (input === undefined) {
    return "";
  }
  return input.length > 24
    ? `${input.substring(0, 5)} ... ${input.substring(
        input.length - 5,
        input.length,
      )}`
    : input;
}

export function Address() {
  const { address } = useAccount();
  const { data } = useStarkProfile({ address });
  const [avatar, setAvatar] = useState<string | undefined>();
  const [isCopied, setCopied] = useClipboard(address || "");

  const starknetId = useMemo(() => {
    if (data !== undefined) {
      return data.name;
    }
    return address;
  }, [address, data]);

  useEffect(() => {
    (async () => {
      const avatar = await getAvatar(data);
      setAvatar(avatar);
    })();
  }, [data]);

  return (
    <div className="flex justify-center items-center gap-3 text-xs">
      {avatar && (
        <img className="w-8 h-8 mr-3 rounded-full" src={avatar} alt="PFP" />
      )}
      <Button className="px-4" size={"sm"} onClick={() => setCopied()}>
        {minifyAddressOrStarknetId(address, starknetId)}
        {isCopied ? " (copied)" : ""}
      </Button>
      <Button className="px-4" size={"sm"} variant={"default"}>
        <a
          target="_blank"
          href="https://blastapi.io/faucets/starknet-sepolia-eth"
        >
          {" "}
          Gas
        </a>
      </Button>
    </div>
  );
}
