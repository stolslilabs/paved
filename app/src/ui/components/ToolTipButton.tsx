import { Button } from "@/ui/elements/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/ui/elements/tooltip";
import { ReactElement } from "react";

export const ToolTipButton = ({
  onClick = () => { },
  icon,
  toolTipText,
  disabled = false,
}: {
  onClick?: () => void;
  icon: ReactElement;
  toolTipText: string;
  disabled?: boolean;
}) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          disabled={disabled}
          variant={"command"}
          size={"command"}
          onClick={onClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p className="select-none">{toolTipText}</p>
      </TooltipContent>
    </Tooltip>
  );
};
