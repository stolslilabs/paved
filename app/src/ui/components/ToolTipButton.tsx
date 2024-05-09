import { Button } from "@/ui/elements/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/elements/tooltip";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/free-solid-svg-icons";

export const ToolTipButton = ({
  onClick = () => {},
  icon,
  toolTipText,
  disabled = false,
}: {
  onClick?: () => void;
  icon: IconDefinition;
  toolTipText: string;
  disabled?: boolean;
}) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            disabled={disabled}
            variant={"command"}
            size={"command"}
            onClick={onClick}
          >
            <FontAwesomeIcon className="sm:h-4 md:h-8" icon={icon} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">{toolTipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};