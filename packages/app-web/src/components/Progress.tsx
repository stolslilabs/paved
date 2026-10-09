import { useIndexerRead } from "@paved/chain";
import type { IndexerAnswer, PlayerAchievement, PlayerQuest, QuestDefinition, AchievementDefinition } from "@paved/chain";
import { IndexerFailure, IndexerLag } from "./IndexerLag";
import { ACHIEVEMENT_TEXT, QUEST_TEXT, achievementTitle, pointsLabel, questTitle, scheduleLabel, targetsLabel, taskProgressLabel } from "../utils/quests-view";
import { dayLabel } from "../utils/indexer-view";

const SUBJECT = "Quests";
const box = { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } as const;
const item = { border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 } as const;
const muted = { color: "#999", fontSize: 12 } as const;
const badge = { fontSize: 12, borderRadius: 6, padding: "1px 8px", background: "rgba(255,255,255,0.12)" } as const;

/** The answer furthest behind: one lag line stands for every read of a screen. */
function furthestBehind(answers: Array<IndexerAnswer<unknown> | null>): IndexerAnswer<unknown> | null {
  return answers.reduce<IndexerAnswer<unknown> | null>((worst, a) => (a && (!worst || a.behind > worst.behind) ? a : worst), null);
}

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  return <progress aria-label={label} value={value} max={max} style={{ width: "100%" }} />;
}

function Entry({ title, description, tasks, completed, completedAt, retired, aside }: {
  title: string;
  description?: string;
  tasks: Array<{ taskId: number; total: number; count: number }>;
  completed: boolean;
  completedAt: number | null;
  retired: boolean;
  aside?: string;
}) {
  return (
    <li style={item} data-testid="entry">
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong>{title}</strong>
        {completed && <span style={{ ...badge, background: "#14532d" }}>{completedAt ? `Completed ${dayLabel(completedAt)}` : "Completed"}</span>}
        {retired && <span style={badge}>Retired</span>}
        {aside && <span style={{ ...muted, marginLeft: "auto" }}>{aside}</span>}
      </div>
      {description && <div style={muted}>{description}</div>}
      {tasks.map((t) => (
        <div key={t.taskId}>
          <div style={{ fontSize: 13 }}>{taskProgressLabel(t)}</div>
          <Bar value={t.count} max={t.total} label={`${title}: ${taskProgressLabel(t)}`} />
        </div>
      ))}
    </li>
  );
}

function QuestRow({ quest }: { quest: PlayerQuest }) {
  return <Entry title={questTitle(quest.questId)} description={QUEST_TEXT[quest.questId]?.description} {...quest} />;
}

function AchievementRow({ achievement }: { achievement: PlayerAchievement }) {
  return (
    <Entry
      title={achievementTitle(achievement.achievementId)}
      description={ACHIEVEMENT_TEXT[achievement.achievementId]?.description}
      aside={pointsLabel(achievement.points)}
      {...achievement}
    />
  );
}

function DefinitionRows({ quests, achievements }: { quests: QuestDefinition[]; achievements: AchievementDefinition[] }) {
  return (
    <>
      <h3 style={{ margin: "8px 0 0" }}>Daily quests</h3>
      {quests.length === 0 ? (
        <div role="status">No quest is defined yet.</div>
      ) : (
        <ul style={box} aria-label="Quest definitions">
          {quests.map((q) => (
            <li key={q.questId} style={item} data-testid="definition">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <strong>{questTitle(q.questId)}</strong>
                {q.retired && <span style={badge}>Retired</span>}
                <span style={{ ...muted, marginLeft: "auto" }}>{scheduleLabel(q)}</span>
              </div>
              {QUEST_TEXT[q.questId] && <div style={muted}>{QUEST_TEXT[q.questId].description}</div>}
              <div style={{ fontSize: 13 }}>{`Target: ${targetsLabel(q.tasks)}`}</div>
            </li>
          ))}
        </ul>
      )}
      <h3 style={{ margin: "8px 0 0" }}>Achievements</h3>
      {achievements.length === 0 ? (
        <div role="status">No achievement is defined yet.</div>
      ) : (
        <ul style={box} aria-label="Achievement definitions">
          {achievements.map((a) => (
            <li key={a.achievementId} style={item} data-testid="definition">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <strong>{achievementTitle(a.achievementId)}</strong>
                {a.retired && <span style={badge}>Retired</span>}
                <span style={{ ...muted, marginLeft: "auto" }}>{pointsLabel(a.points)}</span>
              </div>
              {ACHIEVEMENT_TEXT[a.achievementId] && <div style={muted}>{ACHIEVEMENT_TEXT[a.achievementId].description}</div>}
              <div style={{ fontSize: 13 }}>{`Target: ${targetsLabel(a.tasks)}`}</div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * The quests of one day and the achievements of a player, and optionally the definitions, from the indexer. Display only:
 * progress is counted by the indexer from the chain's reports, nothing here is a claim or a grant. One lag line stands for
 * the reads; after a failed refresh the rows stay, marked stale.
 */
export function ProgressSections({ playerId, day, waiting = false, definitions = false }: {
  /** The player whose progress is shown; null shows no progress (not connected). */
  playerId: string | null;
  /** The UTC day of the quests; null when no day is known. */
  day: number | null;
  /** The day is not known yet (today's id is being read). */
  waiting?: boolean;
  definitions?: boolean;
}) {
  const quests = useIndexerRead(playerId && day !== null && !waiting ? (c) => c.playerQuests(playerId, { day }) : null, [playerId, day, waiting], { onVisible: true });
  const achievements = useIndexerRead(playerId ? (c) => c.playerAchievements(playerId) : null, [playerId], { onVisible: true });
  const defs = useIndexerRead(definitions ? (c) => c.definitions() : null, [definitions], { onVisible: true });

  const reads = [quests, achievements, defs];
  const stale = reads.find((r) => r.data && r.cause !== null)?.cause ?? null;
  const lag = furthestBehind(reads.map((r) => r.data ?? null));
  const late = lag !== null && lag.freshness.kind === "behind";

  return (
    <>
      <IndexerLag answer={lag} error={stale} subject={SUBJECT} lateNote="progress may be late" testId="progress-lag" />

      {playerId && (
        <section aria-label="Your quests" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 style={{ margin: "8px 0 0" }}>Daily quests</h2>
          {day === null && !waiting ? (
            <div role="status">No day to show yet.</div>
          ) : !quests.data ? (
            quests.error ? <IndexerFailure error={quests.cause} onRetry={quests.refresh} subject={SUBJECT} /> : <div role="status">Loading quests…</div>
          ) : quests.data.data.quests.length === 0 ? (
            <div role="status">No quest on this day.</div>
          ) : (
            <ul style={box} aria-label="Daily quests">
              {quests.data.data.quests.map((q) => (
                <QuestRow key={q.questId} quest={q} />
              ))}
            </ul>
          )}
        </section>
      )}

      {playerId && (
        <section aria-label="Achievements" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 style={{ margin: "8px 0 0" }}>Achievements</h2>
          {!achievements.data ? (
            achievements.error ? <IndexerFailure error={achievements.cause} onRetry={achievements.refresh} subject={SUBJECT} /> : <div role="status">Loading achievements…</div>
          ) : (
            <>
              <div data-testid="achievement-points">{`Achievement points: ${achievements.data.data.points}`}</div>
              {achievements.data.data.achievements.length === 0 ? (
                <div role="status">No achievement is defined yet.</div>
              ) : (
                <ul style={box} aria-label="Achievements list">
                  {achievements.data.data.achievements.map((a) => (
                    <AchievementRow key={a.achievementId} achievement={a} />
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      {definitions && (
        <section aria-label="What counts" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 style={{ margin: "8px 0 0" }}>What counts</h2>
          {!defs.data ? (
            defs.error ? <IndexerFailure error={defs.cause} onRetry={defs.refresh} subject={SUBJECT} /> : <div role="status">Loading definitions…</div>
          ) : (
            <DefinitionRows quests={defs.data.data.quests} achievements={defs.data.data.achievements} />
          )}
        </section>
      )}

      {late && (
        <div style={muted}>The indexer is behind the chain: progress may not show your latest games yet.</div>
      )}
    </>
  );
}
