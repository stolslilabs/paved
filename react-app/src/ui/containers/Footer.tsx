import { Count } from "../components/Count";
import { Score } from "../components/Score";
import { Order } from "../components/Order";
import { Character } from "../components/Character";
import { getCharacters } from "../../utils";
import { useMemo } from "react";

export const Footer = () => {
  const characters = useMemo(() => getCharacters(), []);

  return (
    <footer className="z-20 flex justify-between items-center h-20 absolute bottom-0 w-full">
      {/* <div className="flex justify-center items-center ">
        <Order />
        <Score />
      </div> */}
      <div className="flex justify-center items-center  grow gap-8">
        {characters.map((_character, index) => (
          <Character key={index} index={index} />
        ))}
      </div>
    </footer>
  );
};
