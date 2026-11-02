// A mission of the Missions page by its key (#978): what a link to the page names (`/missions?mission=`), so the page opens with
// that mission on its card.

/** A mission of the Missions page, by what it is: a Tutorial step (#977), a quest of the day or the week, or an achievement. */
export type MissionKey = `tutorial:${number}` | `quest:${number}` | `achievement:${number}`;

/** `tutorial:3`, `quest:12`, `achievement:4`: a mission's key as a link names it (`/missions?mission=`). */
export const MISSION_KEY = /^(tutorial|quest|achievement):[1-9]\d{0,5}$/;

/** The key `value` names, or undefined: a link's parameter, read as a key only when it is one. */
export const missionKeyOf = (value: string | null | undefined): MissionKey | undefined => (value && MISSION_KEY.test(value) ? (value as MissionKey) : undefined);
