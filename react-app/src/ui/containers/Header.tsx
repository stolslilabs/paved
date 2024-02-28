import { Connection } from "../components/Connection";

export const Header = () => {
  return (
    <div className="absolute right-0 h-12 flex justify-end gap-4 p-2">
      <Connection />
    </div>
  );
};
