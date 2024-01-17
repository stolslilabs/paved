import {
  BurnerAccount,
  BurnerManager,
  useBurnerManager,
} from "@dojoengine/create-burner";
import { ReactNode, createContext, useContext, useMemo } from "react";
import { Account, RpcProvider } from "starknet";
import { SetupResult } from "./generated/setup";
import { is } from "@react-three/fiber/dist/declarations/src/core/utils";

interface DojoContextType extends SetupResult {
  masterAccount: Account;
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
    config: { rpcUrl, masterAddress, masterPrivateKey, accountClassHash },
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
  } = useBurnerManager({
    burnerManager: new BurnerManager({
      masterAccount,
      accountClassHash,
      rpcProvider,
    }),
  });

  // if (!isDeploying) {
  //   try {
  //     console.log('deploy');
  //       create();
  //   } catch (e) {
  //       console.log(e);
  //   }
  // }

  return (
    <DojoContext.Provider
      value={{
        ...value,
        masterAccount,
        account: {
          create,
          list,
          get,
          select,
          clear,
          account: masterAccount,  // account ? account : masterAccount,
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
