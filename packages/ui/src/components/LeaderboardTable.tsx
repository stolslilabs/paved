import { styled } from "tamagui";
import { Text, XStack, YStack } from "tamagui";

const TText = Text as any;

export interface LeaderboardTableProps {
  players: { rank: number; name: string; score: number }[];
  isLoading?: boolean;
}

export const LeaderboardTable = styled(YStack as any, {
  name: "LeaderboardTable",
  gap: "$2",
} as any) as any;

export const LeaderboardHeader = styled(XStack as any, {
  name: "LeaderboardHeader",
  paddingHorizontal: "$3",
  paddingVertical: "$2",
  borderBottomWidth: 1,
  borderColor: "$borderColor",
  alignItems: "center",
  gap: "$3",
} as any) as any;

export const LeaderboardRow = styled(XStack as any, {
  name: "LeaderboardRow",
  paddingHorizontal: "$3",
  paddingVertical: "$2",
  borderRadius: "$2",
  alignItems: "center",
  gap: "$3",
  hoverStyle: {
    backgroundColor: "$backgroundHover",
  },
} as any) as any;

export const LeaderboardRank = styled(Text, {
  name: "LeaderboardRank",
  color: "$muted",
  fontSize: "$3",
  fontWeight: "700",
  fontFamily: "$body",
  width: 40,
  textAlign: "center",
});

export const LeaderboardName = styled(Text, {
  name: "LeaderboardName",
  color: "$color",
  fontSize: "$3",
  fontFamily: "$body",
  flex: 1,
});

export const LeaderboardScore = styled(Text, {
  name: "LeaderboardScore",
  color: "$color",
  fontSize: "$3",
  fontWeight: "700",
  fontFamily: "$body",
  width: 80,
  textAlign: "right",
});

export function LeaderboardTableView({
  players,
  isLoading,
}: LeaderboardTableProps) {
  if (isLoading) {
    return <TText color="$muted">{"Loading..."}</TText>;
  }
  if (!players || players.length === 0) {
    return <TText color="$muted">{"No players yet"}</TText>;
  }
  return (
    <LeaderboardTable>
      <LeaderboardHeader>
        <LeaderboardRank>{"Rank"}</LeaderboardRank>
        <LeaderboardName>{"Player"}</LeaderboardName>
        <LeaderboardScore>{"Score"}</LeaderboardScore>
      </LeaderboardHeader>
      {players.map((p) => (
        <LeaderboardRow key={p.rank}>
          <LeaderboardRank>{`${p.rank}`}</LeaderboardRank>
          <LeaderboardName>{p.name}</LeaderboardName>
          <LeaderboardScore>{`${p.score}`}</LeaderboardScore>
        </LeaderboardRow>
      ))}
    </LeaderboardTable>
  );
}
