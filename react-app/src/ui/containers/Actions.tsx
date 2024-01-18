import { useState } from "react";
import { useDojo } from "../../dojo/useDojo";
import { Buy } from "../components/Buy";
import { faExpand, faCompress } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const Actions = () => {
  const [isExpanded, setIsExpanded] = useState(true);

  const {
    account: { account },
    setup: {
      clientComponents: { Builder, Tile, TilePosition },
    },
  } = useDojo();

  return (
    <div className="absolute left-12 bottom-24">
      <div className="flex justify-center items-end gap-4">
        <div className="flex flex-col-reverse gap-4">
          <div
            className="z-20 h-16 w-16 border-2 flex justify-center items-center bg-white cursor-pointer"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <FontAwesomeIcon icon={isExpanded ? faCompress : faExpand} />
          </div>
          {isExpanded && (
            <div className="z-20 h-16 w-16 border-2 flex justify-center items-center bg-white">
              SCR
            </div>
          )}
          {isExpanded && (
            <div className="z-20 h-16 w-16 border-2 flex justify-center items-center bg-white">
              HME
            </div>
          )}
          {isExpanded && (
            <div className="z-20">
              <Buy />
            </div>
          )}
        </div>
        {isExpanded && (
          <div className="flex gap-4">
            <div className="z-20 h-16 w-16 border-2 flex justify-center items-center bg-white">
              VIW
            </div>
            <div className="z-20 h-16 w-16 border-2 flex justify-center items-center bg-white">
              JMP
            </div>
            <div className="z-20 h-16 w-16 border-2 flex justify-center items-center bg-white">
              HLP
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
