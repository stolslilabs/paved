import { dayLabel } from "../utils/indexer-view";

/** The day select of the leaderboard and the quests: the days the indexer lists, today marked, and the day shown when it is not among them. */
export function DayPicker({
  id,
  listed,
  today,
  startTime,
  onChange,
}: {
  id: number;
  listed: Array<{ id: number; startTime: number }>;
  today: number | null | undefined;
  /** Start of day `id` when it is not listed. */
  startTime?: number;
  onChange: (id: number) => void;
}) {
  const options = [...(listed.some((t) => t.id === id) ? [] : [{ id, startTime: startTime ?? 0 }]), ...listed];
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
      Day
      <select
        aria-label="Day"
        value={id}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: "#111", color: "#fff", border: "1px solid #555", borderRadius: 6, padding: "4px 8px" }}
      >
        {options.map((t) => (
          <option key={t.id} value={t.id}>
            {`${t.startTime ? dayLabel(t.startTime) : `Day ${t.id}`}${t.id === today ? " (today)" : ""}`}
          </option>
        ))}
      </select>
    </label>
  );
}
