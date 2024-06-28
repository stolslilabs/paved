import { Scoreboard } from "../components/Scoreboard";
import { Button } from "../elements/button"
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTrigger } from "../elements/drawer"
import expand from "/assets/icons/EXPAND.svg";
import surrenderIcon from "/assets/icons/SURRENDER.svg";
import leaderboardIcon from "/assets/icons/LEADERBOARD.svg"
import homepageIcon from "/assets/icons/HOME.svg"
import settingsIcon from "/assets/icons/VIEW.svg"
import { useActions } from "@/hooks/useActions";
import { LeaderboardDialog } from "../components/Leaderboard";
import { SettingsDialog } from "../components/Settings";
import { useNavigate } from "react-router-dom";
import { Compass } from "../components/Compass";
import { ToolTipButton } from "../components/ToolTipButton";
import { useCameraStore } from "@/store";
import cancelIcon from "/assets/icons/CANCEL.svg"

// TODO: Switch up this component in the refactor, preferably combining it with "Actions"
export const MobileActions = () => {
    const navigate = useNavigate();
    const { setReset } = useCameraStore()
    const { handleSurrender } = useActions();

    return (
        <>
            <Drawer>
                <DrawerTrigger asChild className="absolute z-20 ml-2 mt-2">
                    <Button
                        className={`pointer-events-auto select-none p-2 sm:p-0`}
                        variant="character"
                        size="character"
                    >
                        <img
                            src={expand}
                            className={`h-6 sm:h-4 md:h-8 fill-current duration-300 rotate-90`}
                        />
                    </Button>
                </DrawerTrigger>
                <DrawerContent>
                    <DrawerHeader>
                        <Scoreboard />
                    </DrawerHeader>
                    <DrawerFooter>
                        <div className="flex flex-col gap-2 px-8">
                            <DrawerClose>
                                <Button variant="destructive" className="w-full" onClick={handleSurrender}>
                                    <img src={surrenderIcon} className="absolute left-4 h-4" />Surrender
                                </Button>
                            </DrawerClose>
                            <div className="flex flex-col gap-2 py-2">
                                <LeaderboardDialog>
                                    <Button variant="default" className="w-full">
                                        <img src={leaderboardIcon} className="absolute left-4 h-4" />Leaderboard
                                    </Button>
                                </LeaderboardDialog>
                                <DrawerClose>
                                    <Button variant="default" className="w-full" onClick={() => navigate("", { replace: true })}>
                                        <img src={homepageIcon} className="absolute left-4 h-4" />Homepage
                                    </Button>
                                </DrawerClose>
                                <SettingsDialog>
                                    <Button variant="default" className="w-full">
                                        <img src={settingsIcon} className="absolute left-4 h-4" />Settings
                                    </Button>
                                </SettingsDialog>
                            </div>
                            <DrawerClose>
                                <Button variant="secondary" className="w-full">Cancel</Button>
                            </DrawerClose>
                        </div>
                    </DrawerFooter>
                </DrawerContent>
            </Drawer>
            <div className="flex flex-col absolute top-0 right-0 p-2 z-20 gap-1">
                <Compass />
                <ToolTipButton
                    onClick={() => setReset(true)}
                    icon={<img src={cancelIcon} className="h-8 sm:h-4 md:h-8 fill-current" />}
                    toolTipText="Reset view"
                />
            </div>
        </>
    )
}