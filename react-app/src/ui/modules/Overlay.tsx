import { BottomLeft } from "../containers/BottomLeft";
import { BottomRight } from "../containers/BottomRight";
import { TopLeft } from "../containers/TopLeft";
import { TopRight } from "../containers/TopRight";

export const Overlay = () => {
  return (
    <div className="z-10 absolute w-full h-full pointer-events-none">
      <TopLeft />
      <TopRight />
      <BottomLeft />
      <BottomRight />
    </div>
  );
};
