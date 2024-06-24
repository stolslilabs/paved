import { useDojo } from "@/dojo/useDojo";
import { Button } from "@/ui/elements/button";
import { useAccount, useConnect } from "@starknet-react/core";

export const PREFUND_AMOUNT = "0x3635C9ADC5DEA00000";

export function Connection() {
  const {
    account: { account },
  } = useDojo();
  const { connect, connectors } = useConnect();
  const { isConnected } = useAccount();
  const connectWallet = async () => {
    connect({ connector: connectors[0] });
  };

  if (isConnected || !!account) return null;

  return (
    <Button
      className="px-4 "
      variant={"secondary"}
      size={"sm"}
      onClick={connectWallet}
    >
      Log in
    </Button>
  );
}
