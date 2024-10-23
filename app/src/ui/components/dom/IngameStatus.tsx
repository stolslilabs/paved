import { useDojo } from "@/dojo/useDojo";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useGame } from "@/hooks/useGame";
import { useBuilder } from "@/hooks/useBuilder";
import {
  IconDefinition,
  faFire,
  faHammer,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ModeType } from "@/dojo/game/types/mode";
import { useState } from "react";
import { Game } from "@/dojo/game/models/game";
import { formatTimeUntil } from "@/utils/time";
import { set } from "zod";

export const IngameStatus = ({ hasOpenMenu }: { hasOpenMenu: boolean }) => {
  const { gameId } = useQueryParams();
  const {
    account: { account },
  } = useDojo();

  const { game } = useGame({ gameId });
  const { builder } = useBuilder({ gameId, playerId: account?.address });

  if (game?.mode.value === ModeType.Duel) {
    return (
      <DuelCountdown game={game} hasOpenMenu={hasOpenMenu} />
    )
  }

  return (
    game &&
    builder && (
      <div
        className={`w-full text-[#686868] flex justify-center items-middle col-start-1 sm:col-start-1 row-start-1 absolute ${hasOpenMenu ? "hidden sm:flex" : "flex"}`}
      >
        <StatusSlot data={game.score} />
        <StatusSlot
          iconData={{ def: faHammer, style: "mx-2" }}
          data={`${game.built + 1}/${game.mode.count()}`}
        />
        <StatusSlot
          iconData={{ def: faFire, style: "text-orange-500 mx-2" }}
          data={game.discarded}
        />
      </div>
    )
  );
};

const DuelCountdown = ({ game, hasOpenMenu }: { game: Game, hasOpenMenu: boolean }) => {
  const [timeLeft, setTimeLeft] = useState(game.getEndDate());

  setInterval(() => {
    setTimeLeft(game.getEndDate());
  }, 1000)

  return (
    <div
      className={`w-full text-[#686868] flex justify-center items-middle col-start-1 sm:col-start-1 row-start-1 absolute ${hasOpenMenu ? "hidden sm:flex" : "flex"}`}
    >
      <p>{formatTimeUntil(new Date(timeLeft))}</p>
    </div>
  )
}

type IconData = {
  def: IconDefinition;
  style?: string;
};
type StatusSlotProps = {
  iconData?: IconData;
  data: string | number;
};

const StatusSlot = ({ iconData, data }: StatusSlotProps) => {
  return (
    <div className="flex items-center">
      {iconData && (
        <FontAwesomeIcon className={iconData.style} icon={iconData.def} />
      )}
      <p>{data}</p>
    </div>
  );
};
