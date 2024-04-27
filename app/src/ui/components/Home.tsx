import { Button } from "@/ui/elements/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/elements/tooltip";
import { useNavigate } from "react-router-dom";
import { faHome } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const Home = () => {
  const navigate = useNavigate();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={"command"}
            size={"command"}
            onClick={() => navigate("", { replace: true })}
          >
            <FontAwesomeIcon className="sm:h-4 md:h-12" icon={faHome} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Home page</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
