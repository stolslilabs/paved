import { useDojo } from "@/dojo/useDojo";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useGame } from "@/hooks/useGame";
import { useBuilder } from "@/hooks/useBuilder";
import { IconDefinition, faFire, faHammer } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const IngameStatus = () => {
    const { gameId } = useQueryParams()
    const { account: { account } } = useDojo()

    const { game } = useGame({ gameId })
    const { builder } = useBuilder({ gameId, playerId: account?.address })


    return game && builder && (
        <div className="w-full  text-[#686868] flex justify-center items-start">
            <StatusSlot data={game.score} />
            <StatusSlot iconData={{ def: faHammer, style: "mx-2" }} data={`${game.built + 1}/${game.mode.count()}`} />
            <StatusSlot iconData={{ def: faFire, style: "text-orange-500 mx-2" }} data={game.discarded} />
        </div>
    )
}

type IconData = {
    def: IconDefinition
    style?: string
}
type StatusSlotProps = {
    iconData?: IconData
    data: string | number
}

const StatusSlot = ({ iconData, data }: StatusSlotProps) => {
    return (
        <div className="flex items-center">
            {iconData && <FontAwesomeIcon className={iconData.style} icon={iconData.def} />}
            <p>{data}</p>
        </div>
    )
}