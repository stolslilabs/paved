/** The mocks' fixed clock, seconds since the epoch: 2026-10-14 15:00 UTC. Scenes take `now` as a prop, so stories stay still. */
export const MOCK_NOW = 1_791_990_000;

export const HOUR = 3_600;
export const DAY = 86_400;

/** The mocks' time zone: a scene that prints a local time reads the same for every viewer of its story. */
export const MOCK_TIME_ZONE = "Europe/Paris";
