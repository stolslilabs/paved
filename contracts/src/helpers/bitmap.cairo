// Core imports

use core::integer::BoundedInt;

// Internal imports

use paved::constants;

// Errors

mod errors {
    const INVALID_INDEX: felt252 = 'Bitmap: Invalid index';
}

#[generate_trait]
impl Bitmap of BitmapTrait {
    #[inline(always)]
    fn get_bit_at(bitmap: u128, index: felt252) -> bool {
        let mask = Bitmap::two_pow(index);
        bitmap & mask == mask
    }

    #[inline(always)]
    fn set_bit_at(bitmap: u128, index: felt252, value: bool) -> u128 {
        let mask = Bitmap::two_pow(index);
        if value {
            bitmap | mask
        } else {
            bitmap & (BoundedInt::max() - mask)
        }
    }

    #[inline(always)]
    fn swap_bit_at(bitmap: u128, index1: felt252, index2: felt252) -> u128 {
        let bit1 = Bitmap::get_bit_at(bitmap, index1);
        let bit2 = Bitmap::get_bit_at(bitmap, index2);
        let bitmap = Bitmap::set_bit_at(bitmap, index1, bit2);
        Bitmap::set_bit_at(bitmap, index2, bit1)
    }

    #[inline(always)]
    fn two_pow(exponent: felt252) -> u128 {
        if exponent == 0 {
            return constants::TWO_POW_0;
        } else if exponent == 1 {
            return constants::TWO_POW_1;
        } else if exponent == 2 {
            return constants::TWO_POW_2;
        } else if exponent == 3 {
            return constants::TWO_POW_3;
        } else if exponent == 4 {
            return constants::TWO_POW_4;
        } else if exponent == 5 {
            return constants::TWO_POW_5;
        } else if exponent == 6 {
            return constants::TWO_POW_6;
        } else if exponent == 7 {
            return constants::TWO_POW_7;
        } else if exponent == 8 {
            return constants::TWO_POW_8;
        } else if exponent == 9 {
            return constants::TWO_POW_9;
        } else if exponent == 10 {
            return constants::TWO_POW_10;
        } else if exponent == 11 {
            return constants::TWO_POW_11;
        } else if exponent == 12 {
            return constants::TWO_POW_12;
        } else if exponent == 13 {
            return constants::TWO_POW_13;
        } else if exponent == 14 {
            return constants::TWO_POW_14;
        } else if exponent == 15 {
            return constants::TWO_POW_15;
        } else if exponent == 16 {
            return constants::TWO_POW_16;
        } else if exponent == 17 {
            return constants::TWO_POW_17;
        } else if exponent == 18 {
            return constants::TWO_POW_18;
        } else if exponent == 19 {
            return constants::TWO_POW_19;
        } else if exponent == 20 {
            return constants::TWO_POW_20;
        } else if exponent == 21 {
            return constants::TWO_POW_21;
        } else if exponent == 22 {
            return constants::TWO_POW_22;
        } else if exponent == 23 {
            return constants::TWO_POW_23;
        } else if exponent == 24 {
            return constants::TWO_POW_24;
        } else if exponent == 25 {
            return constants::TWO_POW_25;
        } else if exponent == 26 {
            return constants::TWO_POW_26;
        } else if exponent == 27 {
            return constants::TWO_POW_27;
        } else if exponent == 28 {
            return constants::TWO_POW_28;
        } else if exponent == 29 {
            return constants::TWO_POW_29;
        } else if exponent == 30 {
            return constants::TWO_POW_30;
        } else if exponent == 31 {
            return constants::TWO_POW_31;
        } else if exponent == 32 {
            return constants::TWO_POW_32;
        } else if exponent == 33 {
            return constants::TWO_POW_33;
        } else if exponent == 34 {
            return constants::TWO_POW_34;
        } else if exponent == 35 {
            return constants::TWO_POW_35;
        } else if exponent == 36 {
            return constants::TWO_POW_36;
        } else if exponent == 37 {
            return constants::TWO_POW_37;
        } else if exponent == 38 {
            return constants::TWO_POW_38;
        } else if exponent == 39 {
            return constants::TWO_POW_39;
        } else if exponent == 40 {
            return constants::TWO_POW_40;
        } else if exponent == 41 {
            return constants::TWO_POW_41;
        } else if exponent == 42 {
            return constants::TWO_POW_42;
        } else if exponent == 43 {
            return constants::TWO_POW_43;
        } else if exponent == 44 {
            return constants::TWO_POW_44;
        } else if exponent == 45 {
            return constants::TWO_POW_45;
        } else if exponent == 46 {
            return constants::TWO_POW_46;
        } else if exponent == 47 {
            return constants::TWO_POW_47;
        } else if exponent == 48 {
            return constants::TWO_POW_48;
        } else if exponent == 49 {
            return constants::TWO_POW_49;
        } else if exponent == 50 {
            return constants::TWO_POW_50;
        } else if exponent == 51 {
            return constants::TWO_POW_51;
        } else if exponent == 52 {
            return constants::TWO_POW_52;
        } else if exponent == 53 {
            return constants::TWO_POW_53;
        } else if exponent == 54 {
            return constants::TWO_POW_54;
        } else if exponent == 55 {
            return constants::TWO_POW_55;
        } else if exponent == 56 {
            return constants::TWO_POW_56;
        } else if exponent == 57 {
            return constants::TWO_POW_57;
        } else if exponent == 58 {
            return constants::TWO_POW_58;
        } else if exponent == 59 {
            return constants::TWO_POW_59;
        } else if exponent == 60 {
            return constants::TWO_POW_60;
        } else if exponent == 61 {
            return constants::TWO_POW_61;
        } else if exponent == 62 {
            return constants::TWO_POW_62;
        } else if exponent == 63 {
            return constants::TWO_POW_63;
        } else if exponent == 64 {
            return constants::TWO_POW_64;
        } else if exponent == 65 {
            return constants::TWO_POW_65;
        } else if exponent == 66 {
            return constants::TWO_POW_66;
        } else if exponent == 67 {
            return constants::TWO_POW_67;
        } else if exponent == 68 {
            return constants::TWO_POW_68;
        } else if exponent == 69 {
            return constants::TWO_POW_69;
        } else if exponent == 70 {
            return constants::TWO_POW_70;
        } else if exponent == 71 {
            return constants::TWO_POW_71;
        } else if exponent == 72 {
            return constants::TWO_POW_72;
        } else if exponent == 73 {
            return constants::TWO_POW_73;
        } else if exponent == 74 {
            return constants::TWO_POW_74;
        } else if exponent == 75 {
            return constants::TWO_POW_75;
        } else if exponent == 76 {
            return constants::TWO_POW_76;
        } else if exponent == 77 {
            return constants::TWO_POW_77;
        } else if exponent == 78 {
            return constants::TWO_POW_78;
        } else if exponent == 79 {
            return constants::TWO_POW_79;
        } else if exponent == 80 {
            return constants::TWO_POW_80;
        } else if exponent == 81 {
            return constants::TWO_POW_81;
        } else if exponent == 82 {
            return constants::TWO_POW_82;
        } else if exponent == 83 {
            return constants::TWO_POW_83;
        } else if exponent == 84 {
            return constants::TWO_POW_84;
        } else if exponent == 85 {
            return constants::TWO_POW_85;
        } else if exponent == 86 {
            return constants::TWO_POW_86;
        } else if exponent == 87 {
            return constants::TWO_POW_87;
        } else if exponent == 88 {
            return constants::TWO_POW_88;
        } else if exponent == 89 {
            return constants::TWO_POW_89;
        } else if exponent == 90 {
            return constants::TWO_POW_90;
        } else if exponent == 91 {
            return constants::TWO_POW_91;
        } else if exponent == 92 {
            return constants::TWO_POW_92;
        } else if exponent == 93 {
            return constants::TWO_POW_93;
        } else if exponent == 94 {
            return constants::TWO_POW_94;
        } else if exponent == 95 {
            return constants::TWO_POW_95;
        } else if exponent == 96 {
            return constants::TWO_POW_96;
        } else if exponent == 97 {
            return constants::TWO_POW_97;
        } else if exponent == 98 {
            return constants::TWO_POW_98;
        } else if exponent == 99 {
            return constants::TWO_POW_99;
        } else if exponent == 100 {
            return constants::TWO_POW_100;
        } else if exponent == 101 {
            return constants::TWO_POW_101;
        } else if exponent == 102 {
            return constants::TWO_POW_102;
        } else if exponent == 103 {
            return constants::TWO_POW_103;
        } else if exponent == 104 {
            return constants::TWO_POW_104;
        } else if exponent == 105 {
            return constants::TWO_POW_105;
        } else if exponent == 106 {
            return constants::TWO_POW_106;
        } else if exponent == 107 {
            return constants::TWO_POW_107;
        } else if exponent == 108 {
            return constants::TWO_POW_108;
        } else if exponent == 109 {
            return constants::TWO_POW_109;
        } else if exponent == 110 {
            return constants::TWO_POW_110;
        } else if exponent == 111 {
            return constants::TWO_POW_111;
        } else if exponent == 112 {
            return constants::TWO_POW_112;
        } else if exponent == 113 {
            return constants::TWO_POW_113;
        } else if exponent == 114 {
            return constants::TWO_POW_114;
        } else if exponent == 115 {
            return constants::TWO_POW_115;
        } else if exponent == 116 {
            return constants::TWO_POW_116;
        } else if exponent == 117 {
            return constants::TWO_POW_117;
        } else if exponent == 118 {
            return constants::TWO_POW_118;
        } else if exponent == 119 {
            return constants::TWO_POW_119;
        } else if exponent == 120 {
            return constants::TWO_POW_120;
        } else if exponent == 121 {
            return constants::TWO_POW_121;
        } else if exponent == 122 {
            return constants::TWO_POW_122;
        } else if exponent == 123 {
            return constants::TWO_POW_123;
        } else if exponent == 124 {
            return constants::TWO_POW_124;
        } else if exponent == 125 {
            return constants::TWO_POW_125;
        } else if exponent == 126 {
            return constants::TWO_POW_126;
        } else if exponent == 127 {
            return constants::TWO_POW_127;
        };
        panic(array![errors::INVALID_INDEX,]);
        0
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

    #[test]
    fn test_helpers_swap_bit_at() {
        let bitmap = 3;
        let result = Bitmap::swap_bit_at(bitmap, 10, 1);
        assert(result == 1025, 'Bitmap: Invalid bitmap');
    }
}
