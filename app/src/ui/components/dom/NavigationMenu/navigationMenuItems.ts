import homeIcon from "/assets/icons/home.svg";
import leaderboardIcon from "/assets/icons/leaderboard.svg";
import soundOffIcon from "/assets/icons/sound-off.svg";
import soundOnIcon from "/assets/icons/sound-on.svg";
import helpGuideIcon from "/assets/icons/help-guide.svg";
import strategyViewIcon from "/assets/icons/strategy-view.svg";
import voxelViewIcon from "/assets/icons/voxel-view.svg";
import rotateIcon from "/assets/icons/rotate.svg";
import burnIcon from "/assets/icons/burn.svg";

type MenuItem = {
    name: string
    icon: string
    onClick: () => void
    toggleItem?: MenuItem // If the item is a toggle, this is the item to toggle
}

export const NavigationMenuItems: Array<MenuItem> = [
    {
        name: "Home",
        icon: homeIcon,
        onClick: () => {
            console.log("Home")
        }
    },
    {
        name: "Leaderboard",
        icon: leaderboardIcon,
        onClick: () => {
            console.log("Leaderboard")
        }
    },
    {
        name: "Toggle Music ON",
        icon: soundOnIcon,
        onClick: () => {
            console.log("Toggle Music ON")
        },
        toggleItem: {
            name: "Toggle Music OFF",
            icon: soundOffIcon,
            onClick: () => {
                console.log("Toggle Music OFF")
            }
        }
    },
    {
        name: "Help Guide",
        icon: helpGuideIcon,
        onClick: () => {
            console.log("Help Guide")
        }
    },
    {
        name: "Strategy Mode",
        icon: strategyViewIcon,
        onClick: () => {
            console.log("Strategy Mode")
        },
        toggleItem: {
            name: "Voxel Mode",
            icon: voxelViewIcon,
            onClick: () => {
                console.log("Voxel Mode")
            }
        }
    },
    {
        name: "Rotate Board",
        icon: rotateIcon,
        onClick: () => {
            console.log("Rotate Board")
        }
    },
    {
        name: "Burn",
        icon: burnIcon,
        onClick: () => {
            console.log("Burn")
        }
    }
]