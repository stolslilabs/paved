import { useState, useEffect } from "react";

export const useMultiClick = (
  handleSimpleClick: () => void,
  handleDoubleClick: () => void,
  { delay = 150 } = {},
) => {
  const [click, setClick] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      // simple click
      if (click === 1) handleSimpleClick();
      setClick(0);
    }, delay);

    // the duration between this click and the previous one
    // is less than the value of delay = double-click
    if (click === 2) handleDoubleClick();

    return () => clearTimeout(timer);
  }, [click]);

  return () => setClick((prev) => prev + 1);
};
