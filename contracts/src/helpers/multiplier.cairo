// Internal imports

use paved::constants::{BASE, MULTIPLIER};

fn compute_multiplier(exp: u32) -> (u32, u32) {
    let num = pow_div(BASE, exp.into(), MULTIPLIER);
    (num, MULTIPLIER)
}


fn pow_div<T, +Sub<T>, +Mul<T>, +Div<T>, +Rem<T>, +PartialEq<T>, +Into<u8, T>, +Drop<T>, +Copy<T>>(
    base: T, exp: T, div: T
) -> T {
    if exp == 0_u8.into() {
        div * 1_u8.into()
    } else if exp == 1_u8.into() {
        base
    } else if exp % 2_u8.into() == 0_u8.into() {
        pow_div(base * base / div, exp / 2_u8.into(), div)
    } else {
        base * pow_div(base * base / div, exp / 2_u8.into(), div) / div
    }
}

#[cfg(test)]
mod tests {
    // Core imports

    use core::debug::PrintTrait;

    // Local imports

    use super::{compute_multiplier, MULTIPLIER};

    #[test]
    fn test_multiplier_0() {
        let (num, den) = compute_multiplier(0);
        assert_eq!(num / den, 1);
    }

    #[test]
    fn test_multiplier_1() {
        let (num, den) = compute_multiplier(1);
        assert_eq!(num, 10235);
        assert_eq!(den, MULTIPLIER);
    }

    #[test]
    fn test_multiplier_30() {
        let (num, den) = compute_multiplier(30);
        assert_eq!(num / den, 2);
    }

    #[test]
    fn test_multiplier_50() {
        let (num, den) = compute_multiplier(50);
        assert_eq!(num / den, 3);
    }

    #[test]
    fn test_multiplier_100() {
        let (num, den) = compute_multiplier(100);
        assert_eq!(num / den, 10);
    }
}
