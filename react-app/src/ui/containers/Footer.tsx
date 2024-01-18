import { Count } from "../components/Count";
import { Score } from "../components/Score";
import { Order } from "../components/Order";

export const Footer = () => {
  return (
    <footer className="flex justify-between items-center border-2 h-20 absolute bottom-0 bg-white w-full">
      <div className="flex justify-center items-center border-2 w-72 h-16">
        <Order />
        <Score />
      </div>
      <div className="flex justify-center items-center border-2 grow h-16 gap-8">
        <div className="h-12 w-12 bg-white flex justify-center items-center border-2">
          Lo
        </div>
        <div className="h-12 w-12 bg-white flex justify-center items-center border-2">
          La
        </div>
        <div className="h-12 w-12 bg-white flex justify-center items-center border-2">
          Ad
        </div>
        <div className="h-12 w-12 bg-white flex justify-center items-center border-2">
          Pa
        </div>
        <div className="h-12 w-12 bg-white flex justify-center items-center border-2">
          Al
        </div>
        <div className="h-12 w-12 bg-white flex justify-center items-center border-2">
          Wo
        </div>
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
