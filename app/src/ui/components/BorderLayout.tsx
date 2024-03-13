import { useMemo } from "react";

export const BorderLayout = ({ children }: { children: React.ReactNode }) => {
  const borderColor = useMemo(() => "#7D6669", []);
  return (
    <div className="border-8 w-screen h-screen" style={{ borderColor }}>
      {children}
    </div>
  );
};
