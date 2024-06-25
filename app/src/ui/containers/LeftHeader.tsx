import { Scoreboard } from "../components/Scoreboard";

export const LeftHeader = () => {
  return (
    <div className="z-20 flex flex-col p-2 absolute top-0 left-0 uppercase px-4 ">
      <Scoreboard />
    </div>
  );
};
