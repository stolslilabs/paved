use paved::types::spot::Spot;
use paved::types::move::Move;
use paved::types::area::Area;

trait LayoutTrait {
    /// Return the start spots.
    ///
    /// # Returns
    ///
    /// The reference area.
    fn starts() -> Array<Spot>;
    /// Return available moves.
    /// 
    /// # Arguments
    ///
    /// * `from` - The spot we stand on.
    ///
    /// # Returns
    ///
    /// The array of start spots.
    fn moves(from: Spot) -> Array<Move>;
    /// Return reference Area.
    /// 
    /// # Arguments
    ///
    /// * `from` - The spot we stand on.
    ///
    /// # Returns
    ///
    /// The reference area.
    fn area(from: Spot) -> Area;
    /// Return the adjacent roads.
    /// 
    /// # Arguments
    ///
    /// * `from` - The forest spot we stand on.
    ///
    /// # Returns
    ///
    /// The array of road spots.
    fn adjacent_roads(from: Spot) -> Array<Spot>;
    /// Return the adjacent cities.
    /// 
    /// # Arguments
    ///
    /// * `from` - The forest spot we stand on.
    ///
    /// # Returns
    ///
    /// The array of city spots.
    fn adjacent_cities(from: Spot) -> Array<Spot>;
}
