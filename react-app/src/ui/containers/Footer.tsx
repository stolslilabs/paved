import { Count } from "../components/Count";
import { Score } from "../components/Score";
import { Order } from "../components/Order";
import { Character } from "../components/Character";

export const Footer = () => {
  const characters = ["Lord", "Lady", "Adventurer", "Paladin", "Algrim", "Woodsman"];

  return (
    <footer className="z-20 flex justify-between items-center border-2 h-20 absolute bottom-0 bg-white w-full">
      <div className="flex justify-center items-center border-2 w-72 h-16">
        <Order />
        <Score />
      </div>
      <div className="flex justify-center items-center border-2 grow h-16 gap-8">
        {characters.map((_character, index) => (
          <Character
            key={index}
            index={index}
          />
        ))}
      </div>
      <div className="flex justify-center items-center border-2 w-72 h-16">
        <div className="h-12 w-48 bg-white flex justify-center items-center border-2">
          COOLDOWN
        </div>
        <Count />
      </div>
    </footer>
  );
};
