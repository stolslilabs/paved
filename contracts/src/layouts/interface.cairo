use stolsli::types::direction::Direction;
use stolsli::types::spot::Spot;
use stolsli::types::orientation::Orientation;
use stolsli::types::move::Move;

trait LayoutTrait {
    /// Return available moves.
    ///
    /// * `from` - The spot we stand.
    ///
    /// # Returns
    ///
    /// The array of available moves.
    fn moves(from: Spot) -> Array<Move>;
}
