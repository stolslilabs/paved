// Internal imports

pub use paved::types::plan::Plan;
pub use paved::types::orientation::Orientation;
pub use paved::types::role::Role;
pub use paved::types::spot::Spot;

pub trait DeckTrait {
    fn total_count() -> u8;
    fn count() -> u8;
    fn plan(index: u32) -> Plan;
    fn indexes(plan: Plan) -> Array<u8>;
    fn parameters(index: u32) -> (Orientation, u32, u32, Role, Spot);
}
