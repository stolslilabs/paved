use stolsli::types::direction::Direction;
use stolsli::types::spot::Spot;
use stolsli::types::orientation::Orientation;
use stolsli::types::move::Move;

trait LayoutTrait {
    fn moves(from: Spot) -> Array<Move>;
}
