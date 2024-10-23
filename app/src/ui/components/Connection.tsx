import { useDojo } from "@/dojo/useDojo";
import { useRelog } from "@/hooks/useRelog";
import { Button } from "@/ui/elements/button";
import { useAccount, useConnect } from "@starknet-react/core";

export function Connection() {
  const {
    account: { account },
  } = useDojo();
  const { connect, connectors, status } = useConnect();
  const { isConnected } = useAccount();
  const connectWallet = async () => {
    connect({ connector: connectors[0] });
  };

  const { updateStoredVersion } = useRelog()

  if (status === "success") {
    updateStoredVersion()
  }

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
