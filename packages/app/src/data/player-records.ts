import type { PlayerRecords, SeasonStanding } from "../components/containers/profile-sheet";
import { HALL_OF_FAME, RECORDS } from "../mocks/profile-records";

/**
 * The player's Hall of Fame and records (PROFILE-PAGE): the mock's for now, the same for every player (the owner's ask of
 * 2026-11-04: mock data first, the sources later). Their sources to come: the indexer's `Scored` events summed by player, by season
 * and in all, for the records; each season's crowns rebuilt from the attacks (`arena`) and their reset, for the Hall of Fame. Read in
 * the profile's own chunk only, never the first load.
 */
export function playerRecords(): { hallOfFame: readonly SeasonStanding[]; records: PlayerRecords } {
  return { hallOfFame: HALL_OF_FAME, records: RECORDS };
}
