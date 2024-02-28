import { Connection } from "../components/Connection";

export const Header = () => {
  return (
    <div className="h-12 flex justify-end gap-4 p-2">
      <Connection />
    </div>
  );
};
