import { useDojo } from "@/dojo/useDojo";
import { useCallback, useEffect, useState } from "react";

export const useBalance = ({ address }: { address: string | undefined }) => {
  const {
    setup: { config, rpcProvider },
  } = useDojo();

  const [balance, setBalance] = useState<number>(0);
  const [decimals, setDecimals] = useState<number>(0);

  const getDecimals = useCallback(async () => {
    const call = {
      contractAddress: config.feeTokenAddress,
      entrypoint: "decimals",
      calldata: [],
    };
    const result = await rpcProvider.callContract(call);
    setDecimals(parseInt(result[0], 16));
  }, [rpcProvider, config]);

  const getBalanceOf = useCallback(
    async (address: string) => {
      try {
        const call = {
          contractAddress: config.feeTokenAddress,
          entrypoint: "balanceOf",
          calldata: [address],
        };
        const result = await rpcProvider.callContract(call);
        setBalance(parseInt(result[0], 16) + parseInt(result[1], 16));
      } catch (error) {
        const call = {
          contractAddress: config.feeTokenAddress,
          entrypoint: "balance_of",
          calldata: [address],
        };
        const result = await rpcProvider.callContract(call);
        setBalance(parseInt(result[0], 16) + parseInt(result[1], 16));
      }
    },
    [rpcProvider, config],
  );

  useEffect(() => {
    getDecimals();
  }, [getDecimals]);

  useEffect(() => {
    if (address) {
      // Update balance every 10 seconds
      getBalanceOf(address);
      const interval = setInterval(() => {
        getBalanceOf(address);
      }, 10000);

      return () => clearInterval(interval);
    }
  }, [address, getBalanceOf]);

  return { balance: balance / 10 ** decimals };
};
