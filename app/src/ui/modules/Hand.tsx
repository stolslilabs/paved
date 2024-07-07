import { Tile } from "../components/Tile";
import { Rotation } from "../components/Rotation";
import { Discard } from "../actions/Discard";
import { Confirm } from "../actions/Confirm";
import { Deck } from "../containers/Deck";

export const Hand = () => {
  return (
    <div className="absolute right-2 md:right-4 bottom-2 md:bottom-4 z-30 flex flex-col lg:flex-row">
      <div className="grid grid-cols-2 lg:grid-cols-1 lg:pr-3 lg:space-y-2 gap-1 justify-items-center pb-1">
        <Confirm />
        <Rotation />
        <hr className="hidden lg:block" />
        <Deck />
        <Discard />
      </div>

      <Tile />
    </div>
  );
};
