import { Initialize } from "../components/Initialize";
import { Create } from "../components/Create";

export const Header = () => {
  return (
    <div className="flex justify-between items-center border-2 h-20 absolute top-0 w-full bg-white uppercase">
      <div className="flex justify-center items-center border-2 w-72 h-16">
        LINKS
      </div>
      <div className="flex justify-center items-center border-2 grow h-16">
        GAMEPLAY INFO
      </div>
      <div className="flex justify-center items-center border-2 w-72 h-16">
        <Initialize />
        <Create />
      </div>
    </div>
  );
};
