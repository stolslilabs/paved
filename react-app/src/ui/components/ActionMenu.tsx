import { useState } from "react";
import { useDojo } from "../../dojo/useDojo";
import { Event, InvokeTransactionReceiptResponse, shortString } from 'starknet';
import { Button } from "@/components/ui/button"
import { useUIStore } from "../../store";
import { useGameIdStore } from "../../store";

export const ActionMenu = () => {
  const [isExpanded, setIsExpanded] = useState(true);

  const game_id = useGameIdStore((state: any) => state.game_id);
  const {
    account: { account },
    setup: {
      clientComponents: { Builder, Tile, TilePosition },
    },
  } = useDojo();

  return (
    <div className="flex justify-center items-end gap-4">
      <div className="flex flex-col-reverse gap-4">
          <div
            className="h-16 w-16 border-2 flex justify-center items-center bg-white"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            EXP
          </div>
          {isExpanded && <div className="h-16 w-16 border-2 flex justify-center items-center bg-white">SCR</div>}
          {isExpanded && <div className="h-16 w-16 border-2 flex justify-center items-center bg-white">HME</div>}
          {isExpanded && <div className="h-16 w-16 border-2 flex justify-center items-center bg-white">BUY</div>}
      </div>
      {isExpanded && <div className="flex gap-4">
        <div className="h-16 w-16 border-2 flex justify-center items-center bg-white">VIW</div>
        <div className="h-16 w-16 border-2 flex justify-center items-center bg-white">JMP</div>
        <div className="h-16 w-16 border-2 flex justify-center items-center bg-white">HLP</div>
      </div>}
    </div>
  );
};
