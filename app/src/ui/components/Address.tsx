import { useStarkProfile } from "@starknet-react/core";
import { useMemo } from "react";
import useClipboard from "react-use-clipboard";
import { Button } from "../elements/button";
import { useDojo } from "@/dojo/useDojo";
import purchaseLordsIcon from "/assets/icons/purchase-lords.svg";

function minifyAddressOrStarknetId(
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
  const {
    account: { account },
  } = useDojo();

  const { data } = useStarkProfile({ address: account?.address });
  const [isCopied, setCopied] = useClipboard(account?.address || "");

  const starknetId = useMemo(() => {
    if (data !== undefined) {
      return data.name;
    }
    return account?.address;
  }, [account, data]);

  return (
    <div className="flex justify-end items-center gap-3 text-xs mb-4">
      <Button className="px-4 rounded-none" size={"sm"} onClick={() => setCopied()}>
        {minifyAddressOrStarknetId(account?.address, starknetId)}
        {isCopied ? " (copied)" : ""}
      </Button>
      <a target="_blank" href="https://blastapi.io/faucets/starknet-sepolia-eth">
        <img src={purchaseLordsIcon} className="size-10" />
      </a>
    </div>
  );
}
