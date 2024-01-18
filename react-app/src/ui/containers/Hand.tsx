import { Tile } from "../components/Tile";
import { Rotation } from "../components/Rotation";
import { Discard } from "../components/Discard";
import { Confirm } from "../components/Confirm";

export const Hand = () => {
  return (
    <div className="absolute right-12 bottom-24">
      <div className="h-64 w-64 flex justify-center items-center">
        <div className="grid grid-rows-3 grid-flow-col gap-4 h-full w-full">
          <div className="z-20 row-start-2 row-span-1 col-span-1 border-2 flex justify-center items-center bg-white">
            REM
          </div>
          <Confirm />
          <Discard />
          <Tile />
          <Rotation />
        </div>
      </div>
    </div>
  );
};
