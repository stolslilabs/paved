import { useState, useEffect } from "react";
export function useBalance(config, address) {
    const [balance, setBalance] = useState(0n);
    useEffect(() => {
        if (!address)
            return;
        let cancelled = false;
        const pollBalance = async () => {
            try {
                // Placeholder: actual implementation calls ERC20 balanceOf on feeTokenAddress
                // const provider = new RpcProvider({ nodeUrl: config.rpcUrl });
                // const result = await provider.callContract({ ... });
                if (!cancelled)
                    setBalance(0n);
            }
            catch {
                // Silent fail on balance poll
            }
        };
        pollBalance();
        const interval = setInterval(pollBalance, 10_000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [config, address]);
    return { balance };
}
//# sourceMappingURL=useBalance.js.map