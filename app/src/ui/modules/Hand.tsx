import { Tile } from "../components/Tile";
import { Rotation } from "../components/Rotation";
import { Discard } from "../components/Discard";
import { Confirm } from "../components/Confirm";
import { Cancel } from "../components/Cancel";

export const Hand = () => {
  return (
    <div className="absolute right-2 md:right-4 bottom-2 md:bottom-4 z-30 flex">
      <div className="pr-3 space-y-2">
        {" "}
        <Confirm />
        <Rotation />
        <hr />
        <Cancel />
        <Discard />
      </div>

      <Tile />
    </div>
  );
};
