import { useEffect } from "react";
import { toastError } from "../components/containers/error-toast";
import { errorDetail } from "./error-detail";

/** A failed connect or disconnect said in a toast: the home and play scenes have no place for it. */
export function useConnectError(error: string | null) {
  useEffect(() => {
    if (error) toastError({ title: "Wallet", message: error, detail: errorDetail(error) });
  }, [error]);
}
