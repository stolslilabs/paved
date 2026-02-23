import { useNavigate } from "react-router-dom";
import { LandingScreen } from "@paved/ui";

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <LandingScreen
      connected={false}
      onPlay={() => navigate("/game")}
      onSpawn={() => {
        // TODO: Connect wallet and create account
        console.log("Spawn player");
      }}
    />
  );
}
