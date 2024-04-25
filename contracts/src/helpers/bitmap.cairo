// Core imports

use core::integer::BoundedInt;

// Internal imports

use paved::constants;
use paved::helpers::math::fast_power;

// Errors

mod errors {
    const INVALID_INDEX: felt252 = 'Bitmap: Invalid index';
}

#[generate_trait]
impl Bitmap of BitmapTrait {
    #[inline(always)]
    fn get_bit_at(bitmap: u128, index: u8) -> bool {
        let mask = fast_power(2_u128, index.into());
        bitmap & mask == mask
    }

    #[inline(always)]
    fn set_bit_at(bitmap: u128, index: u8, value: bool) -> u128 {
        let mask = fast_power(2_u128, index.into());
        if value {
            bitmap | mask
        } else {
            bitmap & (BoundedInt::max() - mask)
        }
    }
}

#[cfg(test)]
mod tests {
    // Core imports

    use core::debug::PrintTrait;

    // Local imports

    use super::{Bitmap};

    #[test]
    fn test_helpers_get_bit_at_0() {
        let bitmap = 0;
        let result = Bitmap::get_bit_at(bitmap, 0);
        assert(!result, 'Bitmap: Invalid bit');
    }

    #[test]
    fn test_helpers_get_bit_at_1() {
        let bitmap = 255;
        let result = Bitmap::get_bit_at(bitmap, 1);
        assert(result, 'Bitmap: Invalid bit');
    }

    #[test]
    fn test_helpers_get_bit_at_10() {
        let bitmap = 3071;
        let result = Bitmap::get_bit_at(bitmap, 10);
        assert(!result, 'Bitmap: Invalid bit');
    }

    #[test]
    fn test_helpers_set_bit_at_0() {
        let bitmap = 0;
        let result = Bitmap::set_bit_at(bitmap, 0, true);
        assert(result == 1, 'Bitmap: Invalid bitmap');
        let result = Bitmap::set_bit_at(bitmap, 0, false);
        assert(result == bitmap, 'Bitmap: Invalid bitmap');
    }

    #[test]
    fn test_helpers_set_bit_at_1() {
        let bitmap = 1;
        let result = Bitmap::set_bit_at(bitmap, 1, true);
        assert(result == 3, 'Bitmap: Invalid bitmap');
        let result = Bitmap::set_bit_at(bitmap, 1, false);
        assert(result == bitmap, 'Bitmap: Invalid bitmap');
    }

    #[test]
    fn test_helpers_set_bit_at_10() {
        let bitmap = 3;
        let result = Bitmap::set_bit_at(bitmap, 10, true);
        assert(result == 1027, 'Bitmap: Invalid bitmap');
        let result = Bitmap::set_bit_at(bitmap, 10, false);
        assert(result == bitmap, 'Bitmap: Invalid bitmap');
    }

    #[test]
    #[should_panic(expected: ('Bitmap: Invalid index',))]
    fn test_helpers_set_bit_at_128() {
        let bitmap = 0;
        Bitmap::set_bit_at(bitmap, 128, true);
    }
}
