import { useStarkProfile } from "@starknet-react/core";
import { useMemo } from "react";
import useClipboard from "react-use-clipboard";
import { Button } from "../elements/button";
import { useDojo } from "@/dojo/useDojo";

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
  const {
    account: { account },
  } = useDojo();
  const { data } = useStarkProfile({ address: account.address });
  const [isCopied, setCopied] = useClipboard(account.address || "");

  const starknetId = useMemo(() => {
    if (data !== undefined) {
      return data.name;
    }
    return account.address;
  }, [account, data]);

  console.log("address", account.address);

  return (
    <div className="flex justify-center items-center gap-3 text-xs">
      <Button className="px-4" size={"sm"} onClick={() => setCopied()}>
        {minifyAddressOrStarknetId(account.address, starknetId)}
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
