use core::traits::TryInto;
use paved::helpers::economy_curve::FP;
pub use paved::models::index::{EconomyConfig, EconomyState, EntrySettlement};

pub mod constants {
    pub const TARGET_MODE_FIXED: u8 = 0;
    pub const TARGET_MODE_AFFINE: u8 = 1;
    pub const BPS_DENOMINATOR: u16 = 10_000;
}

pub mod errors {
    pub const INVALID_BPS_SUM: felt252 = 'Economy: bps invalid';
    pub const INVALID_FP_SCALE: felt252 = 'Economy: fp invalid';
    pub const INVALID_TARGET_MODE: felt252 = 'Economy: mode invalid';
}

#[generate_trait]
pub impl EconomyConfigImpl of EconomyConfigTrait {
    fn default() -> EconomyConfig {
        EconomyConfig {
            id: 1,
            target_mode: constants::TARGET_MODE_FIXED,
            target_fixed: 1_000_000_000_000_000_000,
            target_a: 0,
            target_b: 1_000_000_000_000_000_000,
            target_t0: 0,
            team_bps: 8_000,
            burn_bps: 2_000,
            max_multiplier_fp: FP * 2,
            fp_scale: FP,
            manual_target_override: false,
            target_override: 0,
        }
    }

    fn validate(self: EconomyConfig) {
        let split_total: u16 = self.team_bps + self.burn_bps;
        assert(split_total == constants::BPS_DENOMINATOR, errors::INVALID_BPS_SUM);
        assert(self.fp_scale != 0, errors::INVALID_FP_SCALE);
        assert(self.max_multiplier_fp >= self.fp_scale, errors::INVALID_FP_SCALE);
        assert(
            self.target_mode == constants::TARGET_MODE_FIXED
                || self.target_mode == constants::TARGET_MODE_AFFINE,
            errors::INVALID_TARGET_MODE
        );
    }

    fn target_at(self: EconomyConfig, time: u64) -> u256 {
        if self.manual_target_override {
            return self.target_override.try_into().unwrap();
        }

        if self.target_mode == constants::TARGET_MODE_FIXED {
            return self.target_fixed.try_into().unwrap();
        }

        let slope: u256 = self.target_a.try_into().unwrap();
        let base: u256 = self.target_b.try_into().unwrap();
        let elapsed: u64 = if time > self.target_t0 {
            time - self.target_t0
        } else {
            0
        };
        base + (slope * elapsed.into())
    }

    fn split_entry(self: EconomyConfig, entry_amount: felt252) -> (felt252, felt252) {
        let amount: u256 = entry_amount.try_into().unwrap();
        let bps_denom: u256 = constants::BPS_DENOMINATOR.into();
        let team: u256 = (amount * self.team_bps.into()) / bps_denom;
        let burn: u256 = (amount * self.burn_bps.into()) / bps_denom;
        (team.try_into().unwrap(), burn.try_into().unwrap())
    }
}

#[generate_trait]
pub impl EconomyStateImpl of EconomyStateTrait {
    fn zero() -> EconomyState {
        EconomyState {
            id: 1,
            last_snapshot_time: 0,
            last_supply: 0,
            last_target: 0,
            last_multiplier_fp: FP,
            total_minted: 0,
            total_burned: 0,
            total_team_alloc: 0,
        }
    }
}

#[generate_trait]
pub impl EntrySettlementImpl of EntrySettlementTrait {
    fn zero(game_id: u32) -> EntrySettlement {
        EntrySettlement {
            game_id, entry_amount: 0, team_amount: 0, burn_amount: 0, settled: false,
        }
    }
}

#[cfg(test)]
pub mod tests {
    use super::{EconomyConfig, EconomyConfigTrait, EconomyConfigImpl, constants};

    #[test]
    #[should_panic(expected: ('Economy: bps invalid',))]
    fn test_config_validation_reverts_when_bps_not_equal_10000() {
        let mut config = EconomyConfigImpl::default();
        config.team_bps = 7_500;
        config.burn_bps = 2_000;
        config.validate();
    }

    #[test]
    fn test_affine_target_computation_at_known_timestamps() {
        let mut config = EconomyConfigImpl::default();
        config.target_mode = constants::TARGET_MODE_AFFINE;
        config.target_a = 10;
        config.target_b = 100;
        config.target_t0 = 1000;

        let target_at_t0 = config.target_at(1000);
        let target_after_5 = config.target_at(1005);
        let target_before_t0 = config.target_at(900);

        assert(target_at_t0 == 100_u256, 'Economy: target at t0');
        assert(target_after_5 == 150_u256, 'Economy: target at t+5');
        assert(target_before_t0 == 100_u256, 'Economy: target before t0');
    }

    #[test]
    fn test_override_precedence_behavior() {
        let mut config = EconomyConfigImpl::default();
        config.target_mode = constants::TARGET_MODE_AFFINE;
        config.target_a = 10;
        config.target_b = 100;
        config.target_t0 = 1000;
        config.manual_target_override = true;
        config.target_override = 42;

        let target = config.target_at(5000);
        assert(target == 42_u256, 'Economy: override precedence');
    }
}
