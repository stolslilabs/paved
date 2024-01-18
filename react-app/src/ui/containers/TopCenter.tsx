import { Initialize } from "../components/Initialize";

export const TopCenter = () => {
  return (
    <div className="flex justify-between items-center border-2 h-20 z-10 absolute top-0 w-full bg-white uppercase">
      <div className="flex justify-center items-center border-2 w-36 h-16">
        LINKS
      </div>
      <div className="flex justify-center items-center border-2 grow h-16">
        GAMEPLAY INFO
      </div>
      <div className="flex justify-center items-center border-2 w-36 h-16">
        <Initialize />
      </div>
    </div>
  );
};
