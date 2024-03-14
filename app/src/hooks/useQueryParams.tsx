import { useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";

export function useQueryParams() {
  const navigate = useNavigate();
  const { search, pathname } = useLocation();

  const queryParams = useMemo(() => new URLSearchParams(search), [search]);

  return {
    gameId: parseInt(queryParams.get("id") || "0"),
    clear: () => navigate(pathname),
  };
}
