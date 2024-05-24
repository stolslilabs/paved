import { Tile } from "../components/Tile";
import { Rotation } from "../components/Rotation";
import { Discard } from "../components/Discard";
import { Confirm } from "../components/Confirm";
import { Cancel } from "../components/Cancel";

export const Hand = () => {
  return (
    <div className="absolute right-2 md:right-4 bottom-2 md:bottom-4 z-30 flex flex-col lg:flex-row">
      <div className=" grid grid-cols-2 lg:grid-cols-1 lg:pr-3 lg:space-y-2">
        {" "}
        <Confirm />
        <Rotation />
        <hr className="hidden lg:block" />
        <Cancel />
        <Discard />
      </div>

      <Tile />
    </div>
  );
};
