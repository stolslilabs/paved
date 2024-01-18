import { BottomLeft } from "../containers/BottomLeft";
import { BottomRight } from "../containers/BottomRight";
import { TopCenter } from "../containers/TopCenter";
import { TopLeft } from "../containers/TopLeft";
import { TopRight } from "../containers/TopRight";

export const Overlay = () => {
  return (
    <div className="z-10">
      {/* <TopLeft /> */}
      <TopCenter />
      {/* <TopRight /> */}
      <BottomLeft />
      <BottomRight />
    </div>
  );
};
