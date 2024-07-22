// Internal imports

use paved::types::plan::Plan;
use paved::types::orientation::Orientation;
use paved::types::role::Role;
use paved::types::spot::Spot;

trait DeckTrait {
    fn total_count() -> u8;
    fn count() -> u8;
    fn plan(index: u32) -> Plan;
    fn indexes(plan: Plan) -> Array<u8>;
    fn parameters(index: u32) -> (Orientation, u32, u32, Role, Spot);
}
