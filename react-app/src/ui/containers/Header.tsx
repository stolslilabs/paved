import { Order } from "../components/Order";
import { Score } from "../components/Score";

export const Header = () => {
  return (
    <div className="z-20 flex justify-between items-center absolute top-0 w-full  uppercase px-4 text-white">
      <Order />
      <div className="flex justify-center items-center text-3xl">
        Tiledom v0.1.0
      </div>

      <Score />
    </div>
  );
};
