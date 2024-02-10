import { Actions } from "../containers/Actions";
import { Hand } from "../containers/Hand";
import { LeftHeader } from "../containers/LeftHeader";
import { RightHeader } from "../containers/RightHeader";
import { Characters } from "../containers/Characters";

export const Overlay = () => {
  return (
    <div>
      <LeftHeader />
      <RightHeader />
      <Actions />
      <Hand />
      <Characters />
    </div>
  );
};
