//! The leagues and seasons of PvP (#644, `docs/architecture/leagues.md`): as in Clash of Clans,
//! a league is a range of crowns, the rating of the matchmaker (owner decision of 2026-10-20).
//! Pure functions: the league of a crown count, its group (the macro league the lifetime league
//! missions count, #917), the Cobbles of its season reward, the reset at a season's end, and the
//! season of a time on the calendar. A league's first-time bonus is gone (#917, the owner's ruling
//! of 2026-10-30): reaching each group once in a lifetime is a mission instead.
//!
//! The table is Clash of Clans' leagues before the 2025 update, one crown per trophy, the scale of
//! the matchmaker's crown curves (`paved::matchmaker::crowns`). Every value below is the owner's
//! ruling on the note's "LEAGUES proposal for the owner" (section 9, #644, 2026-10-22): A on every
//! point, and seasons of three months that follow the real seasons. The amounts are each at most
//! 255 so a credit fits `Setup`'s `CobblesClaimed`.
//!
//! **The calendar** (the owner's ruling, corrected on #644): the seasons change at the northern
//! hemisphere's equinoxes and solstices, at the UTC timestamps of the astronomical events. Spring
//! starts at the March equinox, summer at the June solstice, autumn at the September equinox,
//! winter at the December solstice. `SEASON_STARTS` holds the events of 2026 to 2075, computed
//! from JPL's DE440s ephemeris (Skyfield 1.55, `almanac.seasons`), rounded to the second, in Unix
//! time. Past 2075 each event is the same event of 2075 plus whole mean tropical years
//! (`TROPICAL_YEAR`): within 27 minutes of DE440s to 2085 and 52 minutes to 2125.

/// The leagues: 0 Unranked, 1 to 21 Bronze III to Titan I (seven groups of three), 22 Legend.
pub const LEAGUE_COUNT: u8 = 23;
pub const UNRANKED: u8 = 0;
pub const LEGEND: u8 = 22;
/// The groups, Bronze to Titan then Legend (the app's Iron to Master, then Grand Master): the most
/// a village reaches, and the highest total of a lifetime league mission (#917).
pub const LEAGUE_GROUPS: u8 = 8;
/// At a season's end, crowns above this come back to it (Clash of Clans' Legend League reset).
pub const RESET_CROWNS: u32 = 5000;
/// The attacks a village settles in a season to earn that season's reward.
pub const MIN_SEASON_ATTACKS: u16 = 5;
/// The seasons of a year: spring, summer, autumn, winter (the owner's ruling).
pub const SEASONS_PER_YEAR: u64 = 4;
/// The first year of `SEASON_STARTS`.
pub const SEASON_TABLE_FIRST_YEAR: u64 = 2026;
/// The events in `SEASON_STARTS`: four a year, 2026 to 2075.
pub const SEASON_TABLE_LENGTH: u64 = 200;
/// The mean tropical year, 365.24219 days, in seconds: the step past the table's last year.
pub const TROPICAL_YEAR: u64 = 31556925;
/// The first second of each season, 2026 to 2075: the March equinox, June solstice, September
/// equinox and December solstice of each year, UTC, from JPL's DE440s (Skyfield 1.55).
pub const SEASON_STARTS: [u64; 200] = [
    // 2026: 2026-03-20T14:45:57Z, 2026-06-21T08:24:30Z, 2026-09-23T00:05:13Z, 2026-12-21T20:50:14Z
    1774017957, 1782030270, 1790121913,
    1797886214, // 2027: 2027-03-20T20:24:41Z, 2027-06-21T14:10:50Z, 2027-09-23T06:01:43Z, 2027-12-22T02:42:09Z
    1805574281, 1813587050, 1821679303,
    1829443330, // 2028: 2028-03-20T02:17:08Z, 2028-06-20T20:02:00Z, 2028-09-22T11:45:18Z, 2028-12-21T08:19:39Z
    1837131428, 1845144120, 1853235918,
    1860999580, // 2029: 2029-03-20T08:01:58Z, 2029-06-21T01:48:17Z, 2029-09-22T17:38:30Z, 2029-12-21T14:14:06Z
    1868688119, 1876700898, 1884793110,
    1892556846, // 2030: 2030-03-20T13:52:05Z, 2030-06-21T07:31:18Z, 2030-09-22T23:26:53Z, 2030-12-21T20:09:37Z
    1900245126, 1908257479, 1916350013,
    1924114178, // 2031: 2031-03-20T19:40:58Z, 2031-06-21T13:17:08Z, 2031-09-23T05:15:18Z, 2031-12-22T01:55:33Z
    1931802059, 1939814228, 1947906918,
    1955670934, // 2032: 2032-03-20T01:21:53Z, 2032-06-20T19:08:46Z, 2032-09-22T11:10:53Z, 2032-12-21T07:55:56Z
    1963358514, 1971371326, 1979464253,
    1987228557, // 2033: 2033-03-20T07:22:43Z, 2033-06-21T01:01:08Z, 2033-09-22T16:51:41Z, 2033-12-21T13:46:00Z
    1994916164, 2002928469, 2011020701,
    2018785560, // 2034: 2034-03-20T13:17:30Z, 2034-06-21T06:44:12Z, 2034-09-22T22:39:35Z, 2034-12-21T19:34:00Z
    2026473450, 2034485052, 2042577575,
    2050342441, // 2035: 2035-03-20T19:02:44Z, 2035-06-21T12:33:08Z, 2035-09-23T04:38:56Z, 2035-12-22T01:30:53Z
    2058030165, 2066041989, 2074135137,
    2081899853, // 2036: 2036-03-20T01:02:51Z, 2036-06-20T18:32:14Z, 2036-09-22T10:23:20Z, 2036-12-21T07:12:53Z
    2089587771, 2097599535, 2105691800,
    2113456374, // 2037: 2037-03-20T06:50:16Z, 2037-06-21T00:22:27Z, 2037-09-22T16:13:06Z, 2037-12-21T13:07:45Z
    2121144617, 2129156548, 2137248787,
    2145013666, // 2038: 2038-03-20T12:40:39Z, 2038-06-21T06:09:25Z, 2038-09-22T22:02:18Z, 2038-12-21T19:02:21Z
    2152701639, 2160713365, 2168805738,
    2176570941, // 2039: 2039-03-20T18:32:04Z, 2039-06-21T11:57:27Z, 2039-09-23T03:49:38Z, 2039-12-22T00:40:37Z
    2184258724, 2192270247, 2200362579,
    2208127238, // 2040: 2040-03-20T00:11:43Z, 2040-06-20T17:46:25Z, 2040-09-22T09:44:57Z, 2040-12-21T06:32:53Z
    2215815104, 2223827186, 2231919897,
    2239684373, // 2041: 2041-03-20T06:06:51Z, 2041-06-20T23:35:54Z, 2041-09-22T15:26:36Z, 2041-12-21T12:18:22Z
    2247372411, 2255384155, 2263476396,
    2271241103, // 2042: 2042-03-20T11:53:21Z, 2042-06-21T05:15:53Z, 2042-09-22T21:11:36Z, 2042-12-21T18:04:07Z
    2278929202, 2286940554, 2295033097,
    2302797847, // 2043: 2043-03-20T17:27:51Z, 2043-06-21T10:58:26Z, 2043-09-23T03:07:00Z, 2043-12-22T00:01:18Z
    2310485271, 2318497106, 2326590420,
    2334355278, // 2044: 2044-03-19T23:20:37Z, 2044-06-20T16:51:12Z, 2044-09-22T08:47:56Z, 2044-12-21T05:43:40Z
    2342042438, 2350054273, 2358146877,
    2365911820, // 2045: 2045-03-20T05:07:42Z, 2045-06-20T22:33:59Z, 2045-09-22T14:33:01Z, 2045-12-21T11:35:12Z
    2373599262, 2381610840, 2389703581,
    2397468913, // 2046: 2046-03-20T10:57:57Z, 2046-06-21T04:14:45Z, 2046-09-22T20:21:50Z, 2046-12-21T17:28:35Z
    2405156278, 2413167285, 2421260510,
    2429026116, // 2047: 2047-03-20T16:52:46Z, 2047-06-21T10:03:36Z, 2047-09-23T02:08:12Z, 2047-12-21T23:07:21Z
    2436713567, 2444724217, 2452817292,
    2460582442, // 2048: 2048-03-19T22:33:57Z, 2048-06-20T15:54:03Z, 2048-09-22T08:00:46Z, 2048-12-21T05:02:24Z
    2468270038, 2476281244, 2484374447,
    2492139744, // 2049: 2049-03-20T04:28:45Z, 2049-06-20T21:47:28Z, 2049-09-22T13:42:46Z, 2049-12-21T10:52:19Z
    2499827326, 2507838448, 2515930966,
    2523696740, // 2050: 2050-03-20T10:19:44Z, 2050-06-21T03:33:11Z, 2050-09-22T19:28:41Z, 2050-12-21T16:38:53Z
    2531384385, 2539395192, 2547487722,
    2555253534, // 2051: 2051-03-20T15:59:22Z, 2051-06-21T09:18:51Z, 2051-09-23T01:27:34Z, 2051-12-21T22:34:20Z
    2562940762, 2570951931, 2579045254,
    2586810860, // 2052: 2052-03-19T21:56:19Z, 2052-06-20T15:16:26Z, 2052-09-22T07:15:56Z, 2052-12-21T04:17:27Z
    2594498179, 2602509387, 2610602157,
    2618367447, // 2053: 2053-03-20T03:47:38Z, 2053-06-20T21:04:23Z, 2053-09-22T13:06:34Z, 2053-12-21T10:10:12Z
    2626055258, 2634066264, 2642159194,
    2649924612, // 2054: 2054-03-20T09:34:45Z, 2054-06-21T02:47:28Z, 2054-09-22T18:59:48Z, 2054-12-21T16:10:16Z
    2657612086, 2665622849, 2673716388,
    2681482216, // 2055: 2055-03-20T15:28:57Z, 2055-06-21T08:40:12Z, 2055-09-23T00:49:06Z, 2055-12-21T21:55:57Z
    2689169337, 2697180013, 2705273346,
    2713038958, // 2056: 2056-03-19T21:11:26Z, 2056-06-20T14:28:35Z, 2056-09-22T06:39:53Z, 2056-12-21T03:52:00Z
    2720725887, 2728736915, 2736830393,
    2744596320, // 2057: 2057-03-20T03:08:18Z, 2057-06-20T20:19:28Z, 2057-09-22T12:23:41Z, 2057-12-21T09:43:16Z
    2752283299, 2760293969, 2768387021,
    2776153396, // 2058: 2058-03-20T09:05:26Z, 2058-06-21T02:04:29Z, 2058-09-22T18:08:51Z, 2058-12-21T15:25:25Z
    2783840727, 2791850670, 2799943731,
    2807709925, // 2059: 2059-03-20T14:44:42Z, 2059-06-21T07:47:44Z, 2059-09-23T00:04:00Z, 2059-12-21T21:18:25Z
    2815397082, 2823407264, 2831501040,
    2839267106, // 2060: 2060-03-19T20:38:59Z, 2060-06-20T13:46:07Z, 2060-09-22T05:48:41Z, 2060-12-21T03:01:56Z
    2846954339, 2854964768, 2863057722,
    2870823716, // 2061: 2061-03-20T02:26:46Z, 2061-06-20T19:32:45Z, 2061-09-22T11:31:55Z, 2061-12-21T08:49:22Z
    2878511206, 2886521565, 2894614315,
    2902380562, // 2062: 2062-03-20T08:08:02Z, 2062-06-21T01:11:56Z, 2062-09-22T17:20:28Z, 2062-12-21T14:43:14Z
    2910067682, 2918077916, 2926171228,
    2933937794, // 2063: 2063-03-20T13:59:45Z, 2063-06-21T07:02:30Z, 2063-09-22T23:08:48Z, 2063-12-21T20:21:42Z
    2941624786, 2949634950, 2957728129,
    2965494103, // 2064: 2064-03-19T19:39:14Z, 2064-06-20T12:46:17Z, 2064-09-22T04:57:40Z, 2064-12-21T02:09:24Z
    2973181154, 2981191577, 2989285061,
    2997050964, // 2065: 2065-03-20T01:28:49Z, 2065-06-20T18:33:08Z, 2065-09-22T10:43:15Z, 2065-12-21T08:01:25Z
    3004738129, 3012748388, 3020841796,
    3028608086, // 2066: 2066-03-20T07:20:29Z, 2066-06-21T00:17:05Z, 2066-09-22T16:27:42Z, 2066-12-21T13:46:13Z
    3036295229, 3044305025, 3052398462,
    3060164774, // 2067: 2067-03-20T12:54:19Z, 2067-06-21T05:56:43Z, 2067-09-22T22:20:22Z, 2067-12-21T19:43:49Z
    3067851260, 3075861403, 3083955622,
    3091722230, // 2068: 2068-03-19T18:49:43Z, 2068-06-20T11:54:31Z, 2068-09-22T04:07:31Z, 2068-12-21T01:33:25Z
    3099408583, 3107418872, 3115512451,
    3123279206, // 2069: 2069-03-20T00:45:49Z, 2069-06-20T17:42:04Z, 2069-09-22T09:52:39Z, 2069-12-21T07:22:50Z
    3130965949, 3138975724, 3147069160,
    3154836171, // 2070: 2070-03-20T06:35:41Z, 2070-06-20T23:23:23Z, 2070-09-22T15:45:38Z, 2070-12-21T13:20:08Z
    3162522942, 3170532204, 3178626338,
    3186393609, // 2071: 2071-03-20T12:35:30Z, 2071-06-21T05:21:39Z, 2071-09-22T21:38:35Z, 2071-12-21T19:04:43Z
    3194080530, 3202089700, 3210183515,
    3217950284, // 2072: 2072-03-19T18:21:54Z, 2072-06-20T11:14:39Z, 2072-09-22T03:28:42Z, 2072-12-21T00:56:53Z
    3225637315, 3233646880, 3241740522,
    3249507414, // 2073: 2073-03-20T00:14:13Z, 2073-06-20T17:07:54Z, 2073-09-22T09:16:12Z, 2073-12-21T06:51:36Z
    3257194454, 3265204074, 3273297372,
    3281064697, // 2074: 2074-03-20T06:09:46Z, 2074-06-20T22:59:23Z, 2074-09-22T15:04:44Z, 2074-12-21T12:36:11Z
    3288751787, 3296761163, 3304854284,
    3312621371, // 2075: 2075-03-20T11:47:32Z, 2075-06-21T04:41:23Z, 2075-09-22T20:59:48Z, 2075-12-21T18:28:03Z
    3320308052, 3328317684, 3336411588, 3344178484,
];
/// Whether an attack on an NPC village counts for the PvP missions: no, so a second account cannot
/// farm them alone against the NPCs.
pub const MISSIONS_COUNT_NPC: bool = false;
/// The most crowns a village is listed at in the matchmaker's pool: every Legend village shares
/// one bucket, as Legend is one pool in Clash of Clans, and the reset never moves a bucket.
pub const POOL_CROWNS_CAP: u32 = RESET_CROWNS;

/// The floor of leagues 1 to 22, in crowns (section 4).
const LEAGUE_FLOORS: [u32; 22] = [
    400, 500, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800, 3000, 3200,
    3500, 3800, 4100, 4400, 4700, 5000,
];

/// The season reward of a group (Bronze to Titan), then Legend's; Unranked earns nothing.
const GROUP_REWARDS: [u8; 8] = [10, 20, 35, 50, 75, 100, 150, 250];

pub mod errors {
    pub const INVALID_LEAGUE: felt252 = 'Leagues: invalid league';
}

/// The league of `crowns`: the highest whose floor is at or below them, by binary search.
pub fn league_of(crowns: u32) -> u8 {
    let floors = LEAGUE_FLOORS.span();
    let mut low: u32 = 0;
    let mut high: u32 = floors.len();
    while low < high {
        let middle = (low + high) / 2;
        if *floors.at(middle) <= crowns {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    low.try_into().unwrap()
}

/// The first crown count of `league` (0 for Unranked).
pub fn floor_of(league: u8) -> u32 {
    assert(league < LEAGUE_COUNT, errors::INVALID_LEAGUE);
    if league == UNRANKED {
        0
    } else {
        *LEAGUE_FLOORS.span().at((league - 1).into())
    }
}

/// The groups reached at `league`, its group's number: 0 for Unranked, 1 for leagues 1 to 3 (the
/// app's Iron) up to 7 for 19 to 21, and 8 for Legend (Grand Master). The lifetime league missions
/// count it (`Setup`'s `TASK_LEAGUE_REACHED`, #917).
pub fn groups_of(league: u8) -> u8 {
    assert(league < LEAGUE_COUNT, errors::INVALID_LEAGUE);
    if league == UNRANKED {
        0
    } else {
        (group_of(league) + 1).try_into().unwrap()
    }
}

/// The Cobbles of ending a season in `league` (0 for Unranked).
pub fn reward_of(league: u8) -> u8 {
    assert(league < LEAGUE_COUNT, errors::INVALID_LEAGUE);
    if league == UNRANKED {
        0
    } else {
        *GROUP_REWARDS.span().at(group_of(league))
    }
}

/// The crowns after a season's end: at most `RESET_CROWNS`.
pub fn reset(crowns: u32) -> u32 {
    if crowns > RESET_CROWNS {
        RESET_CROWNS
    } else {
        crowns
    }
}

/// The first second of calendar season `index`: 0 is spring 2026, 1 summer 2026, and so on, four a
/// year. Past the table, the same season of its last year plus whole tropical years.
pub fn season_boundary(index: u64) -> u64 {
    let table = SEASON_STARTS.span();
    if index < SEASON_TABLE_LENGTH {
        return *table.at(index.try_into().unwrap());
    }
    let past = index - SEASON_TABLE_LENGTH;
    let last: u32 = (SEASON_TABLE_LENGTH - SEASONS_PER_YEAR + past % SEASONS_PER_YEAR)
        .try_into()
        .unwrap();
    *table.at(last) + (past / SEASONS_PER_YEAR + 1) * TROPICAL_YEAR
}

/// The calendar seasons started at or before `time`: 0 before spring 2026, `index + 1` in calendar
/// season `index` (`season_boundary`).
pub fn calendar_season(time: u64) -> u64 {
    let table = SEASON_STARTS.span();
    if time < *table.at((SEASON_TABLE_LENGTH - 1).try_into().unwrap()) {
        // In the table: the count of its starts at or before `time`, by binary search
        let mut low: u32 = 0;
        let mut high: u32 = table.len();
        while low < high {
            let middle = (low + high) / 2;
            if *table.at(middle) <= time {
                low = middle + 1;
            } else {
                high = middle;
            }
        }
        return low.into();
    }
    // Past it: from the whole tropical years since the last year's spring, then to the exact count
    let spring = *table.at((SEASON_TABLE_LENGTH - SEASONS_PER_YEAR).try_into().unwrap());
    let mut count = SEASON_TABLE_LENGTH
        - SEASONS_PER_YEAR
        + SEASONS_PER_YEAR * ((time - spring) / TROPICAL_YEAR);
    while count > 0 && season_boundary(count - 1) > time {
        count -= 1;
    }
    while season_boundary(count) <= time {
        count += 1;
    }
    count
}

/// Whether `time` is the first second of a calendar season.
pub fn is_season_start(time: u64) -> bool {
    let count = calendar_season(time);
    count != 0 && season_boundary(count - 1) == time
}

/// The season of `time` on a clock whose season 1 starts at `start` (a season's first second): 0
/// before `start` or on an unset clock (`start` 0), else the calendar seasons started since
/// `start`, plus one, saturating at `u32`'s bound.
pub fn season_of(start: u64, time: u64) -> u32 {
    if start == 0 || time < start {
        return 0;
    }
    let season: u64 = calendar_season(time) - calendar_season(start) + 1;
    match season.try_into() {
        Option::Some(value) => value,
        Option::None => core::num::traits::Bounded::<u32>::MAX,
    }
}

/// The first second of season `season` (at least 1) on a clock whose season 1 starts at `start`.
pub fn season_start(start: u64, season: u32) -> u64 {
    season_boundary(calendar_season(start) - 1 + season.into() - 1)
}

/// The group of a ranked league: 0 to 6 for Bronze to Titan, 7 for Legend.
fn group_of(league: u8) -> u32 {
    if league == LEGEND {
        7
    } else {
        ((league - 1) / 3).into()
    }
}
