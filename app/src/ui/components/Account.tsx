import { Button } from "@/ui/elements/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/ui/elements/tooltip";
import { useDojo } from "@/dojo/useDojo";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
} from "@/ui/elements/select";
import { shortenHex } from "@dojoengine/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash, faRocket } from "@fortawesome/free-solid-svg-icons";

export const Account = () => {
  const {
    account: { account, create, clear, list, select },
  } = useDojo();

  return (
    <div className="flex gap-4">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className="w-12"
            variant={"secondary"}
            size={"icon"}
            onClick={() => create()}
          >
            <FontAwesomeIcon icon={faRocket} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Deploy a burner account</p>
        </TooltipContent>
      </Tooltip>

      <Select onValueChange={(value) => select(value)} value={account?.address}>
        <SelectTrigger>
          <SelectValue placeholder="Select Addr" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {list().map((account, index) => {
              return (
                <div key={index} className="flex">
                  <SelectItem value={account?.address}>
                    {shortenHex(account?.address)}
                  </SelectItem>
                </div>
              );
            })}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className="w-12"
            variant={"secondary"}
            size={"icon"}
            onClick={() => clear()}
          >
            <FontAwesomeIcon icon={faTrash} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Clear all burner accounts</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
