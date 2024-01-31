import { useDojo } from "../../dojo/useDojo";
import { Button } from "@/components/ui/button";

export const Create = () => {
  const {
    account,
    setup: {
      client: { play },
    },
  } = useDojo();

  const handleClick = () => {
    play.create({
      account: account.account,
      endtime: 0,
      points_cap: 0,
      tiles_cap: 0,
    });
  };

  return (
    <div className="flex space-x-3 justify-between p-2 flex-wrap">
      <Button variant={"default"} onClick={handleClick}>
        Create
      </Button>
    </div>
  );
};
