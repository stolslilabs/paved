import { GameInfo } from "../components/GameInfo";

export const RightHeader = () => {
  return (
    <div className="z-20 flex justify-between items-center absolute top-0 right-0 uppercase px-4 text-black">
      <GameInfo />
    </div>
  );
};
