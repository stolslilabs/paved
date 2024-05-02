export const BorderLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="w-screen h-screen relative border-paved-brown">
      {children}
    </div>
  );
};
