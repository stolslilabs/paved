use stolsli::types::spot::Spot;
use stolsli::types::move::Move;
use stolsli::types::area::Area;

trait LayoutTrait {
    /// Return available moves.
    ///
    /// * `from` - The spot we stand on.
    ///
    /// # Returns
    ///
    /// The array of available moves.
    fn moves(from: Spot) -> Array<Move>;
    /// Return reference Area.
    ///
    /// * `from` - The spot we stand on.
    ///
    /// # Returns
    ///
    /// The reference area.
    fn area(from: Spot) -> Area;
}
