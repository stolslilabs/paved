// Internal imports

use paved::types::plan::Plan;

trait DeckTrait {
    fn total_count() -> u8;
    fn count() -> u8;
    fn plan(index: u32) -> Plan;
    fn indexes(plan: Plan) -> Array<u8>;
}
