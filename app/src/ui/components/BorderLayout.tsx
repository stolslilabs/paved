export const BorderLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="border-8 w-screen h-screen relative border-paved-brown">
      {children}
    </div>
  );
};
