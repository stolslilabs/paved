import { useRelog } from "@/hooks/useRelog"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/ui/elements/alert-dialog"
import { Button } from "@/ui/elements/button"
import { useDisconnect } from "@starknet-react/core"
import { RefreshCcwIcon } from "lucide-react"

export const OutdatedAlertDialog = () => {
    const { isOutdated, clearStoredVersion } = useRelog()
    const { disconnect } = useDisconnect()

    const handleClick = () => {
        clearStoredVersion()
        disconnect()
    }

    return (
        <AlertDialog open={isOutdated}>
            <AlertDialogContent className="bg-secondary">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <RefreshCcwIcon className="h-5 w-5 text-yellow-500" />
                        The game has been updated!
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        To ensure you have the latest version and to avoid any issues, please
                        log out and log back in.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogAction asChild>
                        <Button onClick={handleClick}>Relog</Button>
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}