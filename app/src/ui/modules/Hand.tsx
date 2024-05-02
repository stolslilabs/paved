import { Tile } from "../components/Tile";
import { Rotation } from "../components/Rotation";
import { Discard } from "../components/Discard";
import { Confirm } from "../components/Confirm";
import { Cancel } from "../components/Cancel";

export const Hand = () => {
  return (
    <div className="absolute right-2 md:right-4 bottom-2 md:bottom-4 z-30">
      <div className="absolute top-0 left-[-40%]">
        <Cancel />
      </div>
      <div className="absolute bottom-0 left-[-40%]">
        <Discard />
      </div>
      <div className="absolute top-[-40%] left-0">
        <Confirm />
      </div>
      <div className="absolute top-[-40%] right-0">
        <Rotation />
      </div>
      <Tile />
    </div>
  );
};
