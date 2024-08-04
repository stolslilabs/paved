import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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

type MenuItem = {
    name: string
    icon: string
    onClick?: () => void
    children?: ReactElement
}

export const NavigationMenu = () => {
    const { gameId } = useQueryParams();
    const { game } = useGame({ gameId });
    const items = useMemo(() => game?.getPlans() || [], [game]);

    const strategyMode = useGameStore((state) => state.strategyMode);
    const setStrategyMode = useGameStore((state) => state.setStrategyMode);
    const toggleStrategyMode = () => setStrategyMode(!strategyMode)

    const navigate = useNavigate();
    const { setMuted, muted } = useMusicPlayer();

    const toggleMusic = () => setMuted(!muted)

    const [compositionOpen, setCompositionOpen] = useState<boolean>(false)

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
            name: muted ? "Toggle Music OFF" : "Toggle Music ON",
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
        <div className="row-span-4 flex flex-col justify-between h-full">
            <Collapsible
                className="pointer-events-auto"
            >
                <CollapsibleTrigger className="mb-1">
                    <IngameButton icon={burgerMenuIcon} />
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-col gap-1 absolute">
                    {NavigationMenuItems.map(({ name, icon, onClick, children }) => (
                        <IngameButton key={name} icon={icon} name={name} onClick={onClick}>
                            {children}
                        </IngameButton>
                    ))}
                </CollapsibleContent>
            </Collapsible>
            <IngameButton
                name="Deck Composition"
                icon={infoIcon}
                onClick={() => setCompositionOpen(true)}
                className="pointer-events-auto"
            />
        </div>
    ) : (
        <ScrollArea className="row-span-4 h-full pointer-events-auto w-28 bg-gray-300 rounded bg-opacity-80">
            <div className="grid grid-cols-2 gap-3 p-2">
                <div
                    key={0}
                    className="w-full aspect-square bg-cover bg-center relative"
                    style={{ backgroundImage: `url('${items[0].plan.getImage()}')` }}
                >
                    <p className="absolute top-0 left-0 text-sm bg-black bg-opacity-50 text-white px-1">
                        {items[0].count}
                    </p>
                </div>
                <img src={cancelIcon} className="justify-self-end self-start h-4 w-4" onClick={() => setCompositionOpen(false)} />
                {items.slice(1).map(
                    (
                        { plan, count }: { plan: Plan; count: number },
                        index: number,
                    ) => (
                        <div
                            key={index}
                            className="w-full aspect-square bg-cover bg-center relative"
                            style={{ backgroundImage: `url('${plan.getImage()}')` }}
                        >
                            <p className="absolute top-0 left-0 text-sm bg-black bg-opacity-50 text-white px-1">
                                {count}
                            </p>
                        </div>
                    )
                )}
            </div>
        </ScrollArea>
    )
}
