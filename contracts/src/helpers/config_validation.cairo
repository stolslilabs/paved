use core::traits::TryInto;
use core::poseidon::{HashState, PoseidonTrait};
use core::hash::HashStateTrait;

use paved::types::deck::{Deck, DeckTrait};
use paved::types::mode::{Mode, ModeTrait};
use paved::models::index::{ConfigPolicy, GameConfigSnapshot, GameConfigTemplate};

pub mod errors {
    pub const INVALID_MODE: felt252 = 'Config: invalid mode';
    pub const INVALID_DECK: felt252 = 'Config: invalid deck';
    pub const DURATION_OUT_OF_RANGE: felt252 = 'Config: invalid duration';
    pub const ENTRY_OUT_OF_RANGE: felt252 = 'Config: invalid entry';
    pub const PRIVATE_REQUIRES_ROOT: felt252 = 'Config: private requires root';
    pub const PRIVATE_DISABLED: felt252 = 'Config: private disabled';
    pub const INVALID_SEED_POLICY: felt252 = 'Config: invalid seed policy';
    pub const INVALID_PROFILE: felt252 = 'Config: invalid profile';
}

pub mod constants {
    pub const POLICY_ID: u8 = 1;
    pub const SEED_DEFAULT: u8 = 0;
    pub const SEED_FIXED: u8 = 1;
    pub const SEED_TOURNAMENT: u8 = 2;
}

pub mod codes {
    pub const OK: u16 = 0;
    pub const INVALID_MODE: u16 = 1;
    pub const INVALID_DECK: u16 = 2;
    pub const INVALID_DURATION: u16 = 3;
    pub const INVALID_ENTRY: u16 = 4;
    pub const PRIVATE_REQUIRES_ROOT: u16 = 5;
    pub const PRIVATE_DISABLED: u16 = 6;
    pub const INVALID_SEED_POLICY: u16 = 7;
    pub const INVALID_PROFILE: u16 = 8;
}

#[derive(Copy, Drop, Serde)]
pub struct RuntimeGameConfig {
    pub mode: u8,
    pub deck_id: u8,
    pub entry_price: felt252,
    pub duration_seconds: u64,
    pub tile_limit: u16,
    pub seed_policy: u8,
    pub scoring_profile_id: u16,
    pub character_profile_id: u16,
    pub allow_discard: bool,
    pub allow_surrender: bool,
    pub private_game: bool,
    pub access_root: felt252,
    pub metadata_uri_hash: felt252,
}

#[derive(Copy, Drop, Serde)]
pub struct ValidationResult {
    pub ok: bool,
    pub code: u16,
}

#[generate_trait]
pub impl RuntimeGameConfigImpl of RuntimeGameConfigTrait {
    fn default_policy() -> ConfigPolicy {
        ConfigPolicy {
            id: constants::POLICY_ID,
            min_duration: 1,
            max_duration: 1_209_600,
            max_entry_price: 10_000_000_000_000_000_000,
            allow_custom_config: true,
            allow_private_games: true,
            admin: 0,
        }
    }

    fn default_for_mode(mode: Mode) -> RuntimeGameConfig {
        let deck: Deck = mode.deck();
        RuntimeGameConfig {
            mode: mode.into(),
            deck_id: deck.into(),
            entry_price: mode.price(),
            duration_seconds: mode.duration(),
            tile_limit: deck.count().into(),
            seed_policy: constants::SEED_DEFAULT,
            scoring_profile_id: 0,
            character_profile_id: 0,
            allow_discard: true,
            allow_surrender: true,
            private_game: false,
            access_root: 0,
            metadata_uri_hash: 0,
        }
    }

    fn validate(self: RuntimeGameConfig, policy: ConfigPolicy) -> ValidationResult {
        let mode: Mode = self.mode.into();
        if mode == Mode::None {
            return ValidationResult { ok: false, code: codes::INVALID_MODE };
        }

        let expected_deck: u8 = mode.deck().into();
        let deck: Deck = self.deck_id.into();
        if deck == Deck::None || self.deck_id != expected_deck {
            return ValidationResult { ok: false, code: codes::INVALID_DECK };
        }
        let max_tiles: u16 = deck.count().into();
        if self.tile_limit == 0 || self.tile_limit > max_tiles {
            return ValidationResult { ok: false, code: codes::INVALID_DECK };
        }

        if self.duration_seconds < policy.min_duration || self.duration_seconds > policy.max_duration {
            return ValidationResult { ok: false, code: codes::INVALID_DURATION };
        }

        let price: u256 = self.entry_price.try_into().unwrap();
        let max_price: u256 = policy.max_entry_price.try_into().unwrap();
        if price > max_price {
            return ValidationResult { ok: false, code: codes::INVALID_ENTRY };
        }

        if self.private_game && !policy.allow_private_games {
            return ValidationResult { ok: false, code: codes::PRIVATE_DISABLED };
        }
        if self.private_game && self.access_root == 0 {
            return ValidationResult { ok: false, code: codes::PRIVATE_REQUIRES_ROOT };
        }

        if self.seed_policy > constants::SEED_TOURNAMENT {
            return ValidationResult { ok: false, code: codes::INVALID_SEED_POLICY };
        }

        if self.scoring_profile_id != 0 || self.character_profile_id != 0 {
            return ValidationResult { ok: false, code: codes::INVALID_PROFILE };
        }

        ValidationResult { ok: true, code: codes::OK }
    }

    fn assert_valid(self: RuntimeGameConfig, policy: ConfigPolicy) {
        let result = self.validate(policy);
        if result.ok {
            return;
        }
        if result.code == codes::INVALID_MODE {
            assert(false, errors::INVALID_MODE);
        } else if result.code == codes::INVALID_DECK {
            assert(false, errors::INVALID_DECK);
        } else if result.code == codes::INVALID_DURATION {
            assert(false, errors::DURATION_OUT_OF_RANGE);
        } else if result.code == codes::INVALID_ENTRY {
            assert(false, errors::ENTRY_OUT_OF_RANGE);
        } else if result.code == codes::PRIVATE_REQUIRES_ROOT {
            assert(false, errors::PRIVATE_REQUIRES_ROOT);
        } else if result.code == codes::PRIVATE_DISABLED {
            assert(false, errors::PRIVATE_DISABLED);
        } else if result.code == codes::INVALID_PROFILE {
            assert(false, errors::INVALID_PROFILE);
        } else {
            assert(false, errors::INVALID_SEED_POLICY);
        }
    }

    fn config_id(self: RuntimeGameConfig) -> u64 {
        let state: HashState = PoseidonTrait::new();
        let state = state.update(self.mode.into());
        let state = state.update(self.deck_id.into());
        let state = state.update(self.entry_price);
        let state = state.update(self.duration_seconds.into());
        let state = state.update(self.tile_limit.into());
        let state = state.update(self.seed_policy.into());
        let state = state.update(self.scoring_profile_id.into());
        let state = state.update(self.character_profile_id.into());
        let state = state.update(if self.allow_discard { 1 } else { 0 });
        let state = state.update(if self.allow_surrender { 1 } else { 0 });
        let state = state.update(if self.private_game { 1 } else { 0 });
        let state = state.update(self.access_root);
        let hash = state.update(self.metadata_uri_hash).finalize();
        let hash_u256: u256 = hash.into();
        let low64: u128 = hash_u256.low & 0xffffffffffffffff_u128;
        low64.try_into().unwrap()
    }

    fn to_template(
        self: RuntimeGameConfig, template_id: u32, version: u16, enabled: bool
    ) -> GameConfigTemplate {
        GameConfigTemplate {
            template_id,
            config_id: self.config_id(),
            mode: self.mode,
            deck_id: self.deck_id,
            entry_price: self.entry_price,
            duration_seconds: self.duration_seconds,
            tile_limit: self.tile_limit,
            seed_policy: self.seed_policy,
            scoring_profile_id: self.scoring_profile_id,
            character_profile_id: self.character_profile_id,
            allow_discard: self.allow_discard,
            allow_surrender: self.allow_surrender,
            private_game: self.private_game,
            access_root: self.access_root,
            metadata_uri_hash: self.metadata_uri_hash,
            enabled,
            version,
        }
    }

    fn runtime_from_template(template: GameConfigTemplate) -> RuntimeGameConfig {
        RuntimeGameConfig {
            mode: template.mode,
            deck_id: template.deck_id,
            entry_price: template.entry_price,
            duration_seconds: template.duration_seconds,
            tile_limit: template.tile_limit,
            seed_policy: template.seed_policy,
            scoring_profile_id: template.scoring_profile_id,
            character_profile_id: template.character_profile_id,
            allow_discard: template.allow_discard,
            allow_surrender: template.allow_surrender,
            private_game: template.private_game,
            access_root: template.access_root,
            metadata_uri_hash: template.metadata_uri_hash,
        }
    }

    fn to_snapshot(
        self: RuntimeGameConfig, game_id: u32, template_id: u32, config_id: u64
    ) -> GameConfigSnapshot {
        GameConfigSnapshot {
            game_id,
            template_id,
            config_id,
            mode: self.mode,
            deck_id: self.deck_id,
            entry_price: self.entry_price,
            duration_seconds: self.duration_seconds,
            tile_limit: self.tile_limit,
            seed_policy: self.seed_policy,
            scoring_profile_id: self.scoring_profile_id,
            character_profile_id: self.character_profile_id,
            allow_discard: self.allow_discard,
            allow_surrender: self.allow_surrender,
            private_game: self.private_game,
            access_root: self.access_root,
            metadata_uri_hash: self.metadata_uri_hash,
        }
    }
}

#[cfg(test)]
pub mod tests {
    use paved::types::mode::Mode;
    use super::{RuntimeGameConfig, RuntimeGameConfigTrait};

    #[test]
    #[should_panic(expected: ('Config: invalid duration',))]
    fn test_rejects_duration_below_min() {
        let policy = RuntimeGameConfigTrait::default_policy();
        let mut config = RuntimeGameConfigTrait::default_for_mode(Mode::Daily);
        config.duration_seconds = 0;
        config.assert_valid(policy);
    }

    #[test]
    #[should_panic(expected: ('Config: invalid duration',))]
    fn test_rejects_duration_above_max() {
        let policy = RuntimeGameConfigTrait::default_policy();
        let mut config = RuntimeGameConfigTrait::default_for_mode(Mode::Daily);
        config.duration_seconds = policy.max_duration + 1;
        config.assert_valid(policy);
    }

    #[test]
    #[should_panic(expected: ('Config: invalid deck',))]
    fn test_rejects_invalid_deck_for_mode() {
        let policy = RuntimeGameConfigTrait::default_policy();
        let mut config = RuntimeGameConfigTrait::default_for_mode(Mode::Daily);
        config.deck_id = 1;
        config.assert_valid(policy);
    }

    #[test]
    #[should_panic(expected: ('Config: private requires root',))]
    fn test_rejects_private_game_without_access_root() {
        let policy = RuntimeGameConfigTrait::default_policy();
        let mut config = RuntimeGameConfigTrait::default_for_mode(Mode::Daily);
        config.private_game = true;
        config.access_root = 0;
        config.assert_valid(policy);
    }

    #[test]
    fn test_accepts_valid_minimal_config() {
        let policy = RuntimeGameConfigTrait::default_policy();
        let config = RuntimeGameConfigTrait::default_for_mode(Mode::Daily);
        let result = config.validate(policy);
        assert(result.ok, 'Config: should pass');
    }

    #[test]
    #[should_panic(expected: ('Config: invalid profile',))]
    fn test_rejects_invalid_profile_ids() {
        let policy = RuntimeGameConfigTrait::default_policy();
        let mut config = RuntimeGameConfigTrait::default_for_mode(Mode::Daily);
        config.scoring_profile_id = 1;
        config.assert_valid(policy);
    }
}
