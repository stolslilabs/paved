// Core imports

use debug::PrintTrait;

// Internal imports

use stolsli::constants::{TWO_POW_24, TWO_POW_32};
use stolsli::models::category::Category;

#[derive(Copy, Drop, Serde)]
struct Edge {
    A: Category,
    B: Category,
    C: Category
}

impl EdgeIntoFelt252 of Into<Edge, felt252> {
    #[inline(always)]
    fn into(self: Edge) -> felt252 {
        let mut felt: felt252 = self.A.into();
        felt *= TWO_POW_24.into();
        felt += ' - ';
        felt *= TWO_POW_32.into();
        felt += self.B.into();
        felt *= TWO_POW_24.into();
        felt += ' - ';
        felt *= TWO_POW_32.into();
        felt += self.C.into();
        felt
    }
}

impl EdgePrint of PrintTrait<Edge> {
    #[inline(always)]
    fn print(self: Edge) {
        let felt: felt252 = self.into();
        felt.print();
    }
}

#[cfg(test)]
mod tests {
    // Core imports

    use debug::PrintTrait;

    // Local imports

    use super::{Edge, Category};

    #[test]
    fn test_edge_into_felt252() {
        let edge = Edge { A: Category::Farm, B: Category::City, C: Category::Road };
        assert_eq!(edge.into(), 'FARM - CITY - ROAD');
    }
}
