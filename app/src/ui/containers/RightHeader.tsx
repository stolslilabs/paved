import { Logsboard } from "../components/Logsboard";

export const RightHeader = () => {
  return (
    <div className="z-20 flex-col gap-4 justify-between items-center absolute top-0 right-0 uppercase px-4 text-black">
      <Logsboard />
    </div>
  );
};
