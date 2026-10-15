import { useEffect } from "react";
import { toast } from "sonner";

/** A failed connect or disconnect said in a toast: the home and play scenes have no place for it. */
export function useConnectError(error: string | null) {
  useEffect(() => {
    if (error) toast.error("Wallet", { description: error });
  }, [error]);
}
