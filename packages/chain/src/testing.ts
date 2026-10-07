// Test doubles for the indexer API. A separate entry (`@paved/chain/testing`) so that no app code
// can reach the fixture server through the package's public entry.
export { FIXTURE_ADA, FIXTURE_BO, FIXTURE_HEAD, FIXTURE_NAMELESS, FIXTURE_TOURNAMENT, FixtureIndexer } from "./indexer-fixture";
export type { FixtureState } from "./indexer-fixture";
