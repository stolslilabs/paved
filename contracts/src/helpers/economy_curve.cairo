use core::traits::TryInto;

pub mod errors {
    pub const ECON_TARGET_ZERO: felt252 = 'ECON_TARGET_ZERO';
}

pub const FP: u32 = 1_000_000;

pub fn compute_multiplier_fp(supply: u256, target: u256) -> u32 {
    assert(target != 0_u256, errors::ECON_TARGET_ZERO);

    let fp_u256: u256 = FP.into();

    if supply <= target {
        let delta = target - supply;
        let scaled = (delta * fp_u256) / target;
        let bounded = if scaled > fp_u256 {
            fp_u256
        } else {
            scaled
        };
        let multiplier = fp_u256 + bounded;
        return multiplier.try_into().unwrap();
    }

    let double_target = target * 2_u256;
    if supply >= double_target {
        return 0;
    }

    let delta = supply - target;
    let scaled = (delta * fp_u256) / target;
    let multiplier = if scaled >= fp_u256 {
        0_u256
    } else {
        fp_u256 - scaled
    };
    multiplier.try_into().unwrap()
}

#[cfg(test)]
pub mod tests {
    use super::{compute_multiplier_fp, FP};

    #[test]
    fn test_multiplier_equals_2x_when_supply_zero_and_target_positive() {
        let multiplier = compute_multiplier_fp(0_u256, 1_000_u256);
        assert(multiplier == FP * 2, 'EconomyCurve: 2x at zero');
    }

    #[test]
    fn test_multiplier_equals_1x_when_supply_equals_target() {
        let multiplier = compute_multiplier_fp(1_000_u256, 1_000_u256);
        assert(multiplier == FP, 'EconomyCurve: 1x at target');
    }

    #[test]
    fn test_multiplier_equals_0_when_supply_equals_double_target() {
        let multiplier = compute_multiplier_fp(2_000_u256, 1_000_u256);
        assert(multiplier == 0, 'EconomyCurve: 0 at 2x');
    }

    #[test]
    fn test_multiplier_monotonic_decrease_between_target_and_double_target() {
        let near_target = compute_multiplier_fp(1_100_u256, 1_000_u256);
        let middle = compute_multiplier_fp(1_500_u256, 1_000_u256);
        let near_double = compute_multiplier_fp(1_900_u256, 1_000_u256);

        assert(near_target > middle, 'EconomyCurve: near>mid');
        assert(middle > near_double, 'EconomyCurve: mid>near2x');
    }

    #[test]
    #[should_panic(expected: ('ECON_TARGET_ZERO',))]
    fn test_multiplier_reverts_when_target_zero() {
        compute_multiplier_fp(1_u256, 0_u256);
    }
}
