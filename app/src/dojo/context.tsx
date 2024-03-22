import { BurnerAccount, useBurnerManager } from "@dojoengine/create-burner";
import { ReactNode, createContext, useContext, useMemo } from "react";
import { Account, RpcProvider } from "starknet";
import { SetupResult } from "./setup";

interface DojoContextType extends SetupResult {
  account: BurnerAccount;
}

export const DojoContext = createContext<DojoContextType | null>(null);

export const DojoProvider = ({
  children,
  value,
}: {
  children: ReactNode;
  value: SetupResult;
}) => {
  const currentValue = useContext(DojoContext);
  if (currentValue) throw new Error("DojoProvider can only be used once");

  const {
    config: { rpcUrl, masterAddress, masterPrivateKey, feeToken },
    burnerManager,
  } = value;

  const rpcProvider = useMemo(
    () =>
      new RpcProvider({
        nodeUrl: rpcUrl,
      }),
    [rpcUrl]
  );

  const masterAccount = useMemo(
    () => new Account(rpcProvider, masterAddress, masterPrivateKey),
    [rpcProvider, masterAddress, masterPrivateKey]
  );

  const {
    create,
    list,
    get,
    account,
    select,
    isDeploying,
    clear,
    copyToClipboard,
    applyFromClipboard,
  } = useBurnerManager({ burnerManager });

  return (
    <DojoContext.Provider
      value={{
        ...value,
        account: {
          create,
          list,
          get,
          select,
          clear,
          account: account ? account : masterAccount,
          isDeploying,
          copyToClipboard,
          applyFromClipboard,
        },
      }}
    >
      {children}
    </DojoContext.Provider>
  );
};
