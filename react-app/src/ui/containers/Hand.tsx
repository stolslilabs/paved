import { Tile } from "../components/Tile";
import { Rotation } from "../components/Rotation";
import { Discard } from "../components/Discard";
import { Confirm } from "../components/Confirm";
import { Button } from "@/components/ui/button";

export const Hand = () => {
  return (
    <div className="absolute right-6 bottom-24 z-20 w-64 h-64">
      <div className="flex top-3 right-0 absolute justify-between space-x-1">
        <Button variant={"default"}>X</Button>
        <Confirm />
        <Discard />
        <Rotation />
      </div>
      <Tile />
    </div>
  );
};
