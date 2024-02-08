import { Actions } from "../containers/Actions";
import { Hand } from "../containers/Hand";
import { LeftHeader } from "../containers/LeftHeader";
import { RightHeader } from "../containers/RightHeader";
import { Footer } from "../containers/Footer";

export const Overlay = () => {
  return (
    <div>
      <LeftHeader />
      <RightHeader />
      <Actions />
      <Hand />
      <Footer />
    </div>
  );
};
