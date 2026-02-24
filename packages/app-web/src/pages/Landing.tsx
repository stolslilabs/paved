import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LandingScreen } from "@paved/ui";
import { useDojo } from "@paved/chain";

function feltToString(felt: string): string {
  const hex = felt.replace(/^0x0*/, "");
  if (!hex) return "Player";
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return String.fromCharCode(...bytes);
}

/** Pad address to 66-char 0x-prefixed format (0x + 64 hex) to match Torii storage */
function padAddress(address: string): string {
  const hex = address.replace(/^0x/, "");
  return "0x" + hex.padStart(64, "0");
}

export function LandingPage() {
  const navigate = useNavigate();
  const { account, provider, isReady, client } = useDojo();
  const [playerName, setPlayerName] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);

  // Poll Torii for player existence
  useEffect(() => {
    if (!account || !client) return;
    let cancelled = false;

    const checkPlayer = async () => {
      try {
        const res = await fetch(client.config.toriiUrl + "/sql", {
          method: "POST",
          body: `SELECT name FROM [paved-Player] WHERE id = '${padAddress(account.address)}'`,
        });
        const rows = await res.json();
        if (!cancelled && rows.length > 0) {
          setPlayerName(feltToString(rows[0].name));
        }
      } catch {
        // Torii not available yet
      }
    };

    checkPlayer();
    const interval = setInterval(checkPlayer, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [account, client]);

  const handleSpawn = async () => {
    if (!account || !provider || creating) return;
    setCreating(true);
    try {
      await provider.execute(
        account as any,
        [
          { contractName: "Token", entrypoint: "mint", calldata: [] },
          {
            contractName: "Account",
            entrypoint: "create",
            calldata: ["0x5061766564", account.address],
          },
        ],
        "paved"
      );
      console.log("Player created");
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.includes("Already exist")) {
        // Player already exists, fine
      } else {
        console.error("Failed to create player:", e);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <LandingScreen
      connected={isReady && !!account}
      playerName={playerName}
      onPlay={() => navigate("/game")}
      onSpawn={handleSpawn}
    />
  );
}
