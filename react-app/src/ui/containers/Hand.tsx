import { Tile } from "../components/Tile";
import { Rotation } from "../components/Rotation";
import { Discard } from "../components/Discard";
import { Confirm } from "../components/Confirm";
import { Collect } from "../components/Collect";
import { Button } from "@/components/ui/button";
import { Count } from "../components/Count";
import { Order } from "../components/Order";
import { Score } from "../components/Score";

export const Hand = () => {
  return (
    <div className="absolute right-6 bottom-6 z-20 w-64 h-64">
      <div className="flex top-3 right-0 absolute justify-between space-x-1">
        <Button variant={"default"}>X</Button>
        <Confirm />
        <Discard />
        <Collect />
        <Rotation />
      </div>

      <Count />
      <Tile />
    </div>
  );
};
