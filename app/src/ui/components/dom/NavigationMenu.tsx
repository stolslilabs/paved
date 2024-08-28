import { IngameButton } from "./IngameButton";
import burgerMenuIcon from "/assets/icons/menu.svg";
import infoIcon from "/assets/icons/info.svg";
import homeIcon from "/assets/icons/home.svg";
import leaderboardIcon from "/assets/icons/leaderboard.svg";
import soundOffIcon from "/assets/icons/sound-off.svg";
import soundOnIcon from "/assets/icons/sound-on.svg";
import helpGuideIcon from "/assets/icons/help-guide.svg";
import strategyViewIcon from "/assets/icons/strategy-view.svg";
import voxelViewIcon from "/assets/icons/voxel-view.svg";
import rotateIcon from "/assets/icons/rotate.svg";
import burnIcon from "/assets/icons/burn.svg";
import { useNavigate } from "react-router-dom";
import { ReactElement, useMemo, useState } from "react";
import { LeaderboardDialog } from "../Leaderboard";
import { useMusicPlayer } from "@/hooks/useMusicPlayer";
import { useGameStore } from "@/store";
import { Compass } from "../Compass";
import { Discard } from "@/ui/actions/Discard";
import { useGame } from "@/hooks/useGame";
import { useQueryParams } from "@/hooks/useQueryParams";
import { Plan } from "@/dojo/game/types/plan";
import { ScrollArea } from "@/ui/elements/scroll-area";
import cancelIcon from "/assets/icons/cancel.svg";
import { TutorialDialog } from "./TutorialDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/elements/collapsible";

type MenuItem = {
    name: string
    icon: string
    onClick?: () => void
    children?: ReactElement
}

// TODO: Simplify this component - too big
export const NavigationMenu = ({ setHasOpenMenu }: { setHasOpenMenu: React.Dispatch<React.SetStateAction<boolean>> }) => {
    const { gameId } = useQueryParams();
    const { game } = useGame({ gameId });
    const items = useMemo(() => game?.getPlans() || [], [game]);

    const strategyMode = useGameStore((state) => state.strategyMode);
    const setStrategyMode = useGameStore((state) => state.setStrategyMode);
    const toggleStrategyMode = () => setStrategyMode(!strategyMode)

    const navigate = useNavigate();
    const { setMuted, muted } = useMusicPlayer();

    const [compositionOpen, setCompositionOpen] = useState<boolean>(false)
    const toggleMusic = () => setMuted(!muted)

    const NavigationMenuItems: Array<MenuItem> = [
        {
            name: "Home",
            icon: homeIcon,
            onClick: () => navigate("", { replace: true })
        },
        {
            name: "Leaderboard",
            icon: leaderboardIcon,
            children: <LeaderboardDialog />
        },
        {
            name: muted ? "Toggle Music ON" : "Toggle Music OFF",
            icon: muted ? soundOnIcon : soundOffIcon,
            onClick: () => toggleMusic(),
        },
        { // TODO: Add Help Guide
            name: "Help Guide",
            icon: helpGuideIcon,
            onClick: () => {
                console.log("Help Guide")
            }
        },
        {
            name: strategyMode ? "Voxel Mode" : "Strategy Mode",
            icon: strategyMode ? voxelViewIcon : strategyViewIcon,
            onClick: toggleStrategyMode,
        },
        {
            name: "Rotate View",
            icon: rotateIcon,
            children: <Compass />
        },
        {
            name: "Burn",
            icon: burnIcon,
            children: <Discard />
        }
    ]

    return !compositionOpen ? (
        <div className="col-span-4 sm:col-span-1 sm:row-span-8 flex sm:flex-col justify-between h-full gap-1">
            <Collapsible
                className="pointer-events-none w-full justify-end"
                onOpenChange={setHasOpenMenu}
            >
                <CollapsibleTrigger asChild className="mb-1 right-4 absolute sm:relative sm:left-0">
                    <IngameButton id="burger-menu" icon={burgerMenuIcon} />
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-row sm:flex-col gap-1 absolute sm:relative top-4 sm:top-auto">
                    {NavigationMenuItems.map(({ name, icon, onClick, children }) => (
                        <IngameButton key={name} icon={icon} name={name} onClick={onClick}>
                            {children}
                        </IngameButton>
                    ))}
                </CollapsibleContent>
            </Collapsible>
            <div className="flex gap-4">
                <IngameButton
                    name="Deck Composition"
                    id="deck-composition"
                    icon={infoIcon}
                    onClick={() => { setCompositionOpen(true); setHasOpenMenu(true) }}
                    className="pointer-events-auto order-first sm:order-last"
                />
                <TutorialDialog />
            </div>
        </div>
    ) : (
        <ScrollArea className="
        pointer-events-auto
        bg-gray-300
        rounded
        bg-opacity-80
        w-full
        col-span-4
        sm:col-span-1
        sm:h-full
        sm:row-span-4
        sm:w-28">
            <div className="
                grid grid-cols-10 sm:grid-cols-2 gap-1.5 sm:gap-3 p-2 h-28 w-full">
                {items.map(
                    (
                        { plan, count }: { plan: Plan; count: number },
                        index: number,
                    ) => (
                        <div
                            key={index}
                            className="w-full sm:h-auto sm:w-full aspect-square bg-cover bg-center relative"
                            style={{ backgroundImage: `url('${plan.getImage()}')` }}
                        >
                            <p className="absolute top-0 left-0 text-sm bg-black bg-opacity-50 text-white px-1">
                                {count}
                            </p>
                        </div>
                    )
                )}
                <img
                    src={cancelIcon}
                    className="h-4 justify-self-end row-start-1 col-start-10 sm:row-start-1 sm:col-start-2"
                    onClick={() => { setCompositionOpen(false); setHasOpenMenu(false) }}
                />
            </div>
        </ScrollArea>
    )
}
