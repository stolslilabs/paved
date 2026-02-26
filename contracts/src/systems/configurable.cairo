use paved::models::index::{ConfigPolicy, GameConfigSnapshot};

#[starknet::interface]
pub trait IConfigurable<TContractState> {
    fn register_default_template(self: @TContractState, mode: u8) -> u32;
    fn register_template(
        self: @TContractState,
        mode: u8,
        deck_id: u8,
        entry_price: felt252,
        duration_seconds: u64,
        tile_limit: u16,
        allow_discard: bool,
        allow_surrender: bool,
        private_game: bool,
        access_root: felt252,
        metadata_uri_hash: felt252,
    ) -> u32;
    fn set_template_enabled(self: @TContractState, template_id: u32, enabled: bool);
    fn create_with_template(self: @TContractState, template_id: u32) -> u32;
    fn create_with_config(
        self: @TContractState,
        mode: u8,
        deck_id: u8,
        entry_price: felt252,
        duration_seconds: u64,
        tile_limit: u16,
        allow_discard: bool,
        allow_surrender: bool,
        private_game: bool,
        access_root: felt252,
        metadata_uri_hash: felt252,
    ) -> u32;
    fn preview_validation(
        self: @TContractState,
        mode: u8,
        deck_id: u8,
        entry_price: felt252,
        duration_seconds: u64,
        tile_limit: u16,
        allow_discard: bool,
        allow_surrender: bool,
        private_game: bool,
        access_root: felt252,
        metadata_uri_hash: felt252,
    ) -> u16;
    fn get_effective_config(self: @TContractState, game_id: u32) -> GameConfigSnapshot;
    fn get_policy(self: @TContractState) -> ConfigPolicy;
    fn set_policy(
        self: @TContractState,
        min_duration: u64,
        max_duration: u64,
        max_entry_price: felt252,
        allow_custom_config: bool,
        allow_private_games: bool,
    );
}

#[dojo::contract]
pub mod Configurable {
    use starknet::get_caller_address;
    use starknet::ContractAddress;
    use dojo::world::IWorldDispatcherTrait;

    use paved::components::emitter::EmitterComponent;
    use paved::components::hostable::HostableComponent;
    use paved::components::payable::PayableComponent;
    use paved::helpers::config_templates::ConfigTemplatesTrait;
    use paved::helpers::config_validation::{RuntimeGameConfig, RuntimeGameConfigTrait};
    use paved::store::{Store, StoreImpl};
    use paved::types::mode::Mode;
    use paved::models::index::{ConfigPolicy, GameConfigSnapshot};

    use super::IConfigurable;

    pub mod errors {
        pub const TEMPLATE_NOT_FOUND: felt252 = 'Config: template not found';
        pub const TEMPLATE_DISABLED: felt252 = 'Config: template disabled';
        pub const CUSTOM_CONFIG_DISABLED: felt252 = 'Config: custom disabled';
        pub const NOT_ADMIN: felt252 = 'Config: not admin';
    }

    component!(path: EmitterComponent, storage: emitter, event: EmitterEvent);
    impl EmitterImpl = EmitterComponent::EmitterImpl<ContractState>;
    component!(path: HostableComponent, storage: hostable, event: HostableEvent);
    impl HostableInternalImpl = HostableComponent::InternalImpl<ContractState>;
    component!(path: PayableComponent, storage: payable, event: PayableEvent);
    impl PayableInternalImpl = PayableComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        emitter: EmitterComponent::Storage,
        #[substorage(v0)]
        hostable: HostableComponent::Storage,
        #[substorage(v0)]
        payable: PayableComponent::Storage,
    }

    #[derive(Drop, Serde, starknet::Event)]
    struct TemplateRegistered {
        #[key]
        template_id: u32,
        version: u16,
    }

    #[derive(Drop, Serde, starknet::Event)]
    struct TemplateStatusUpdated {
        #[key]
        template_id: u32,
        enabled: bool,
    }

    #[derive(Drop, Serde, starknet::Event)]
    struct GameCreatedWithTemplate {
        #[key]
        game_id: u32,
        template_id: u32,
        config_id: u64,
    }

    #[derive(Drop, Serde, starknet::Event)]
    struct GameCreatedWithConfig {
        #[key]
        game_id: u32,
        creator: felt252,
        config_id: u64,
    }

    #[derive(Drop, Serde, starknet::Event)]
    struct GameConfigSnapshotted {
        #[key]
        game_id: u32,
        config_id: u64,
    }

    #[derive(Drop, Serde, starknet::Event)]
    struct ConfigValidationFailed {
        #[key]
        creator: felt252,
        code: u16,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        TemplateRegistered: TemplateRegistered,
        TemplateStatusUpdated: TemplateStatusUpdated,
        GameCreatedWithTemplate: GameCreatedWithTemplate,
        GameCreatedWithConfig: GameCreatedWithConfig,
        GameConfigSnapshotted: GameConfigSnapshotted,
        ConfigValidationFailed: ConfigValidationFailed,
        #[flat]
        EmitterEvent: EmitterComponent::Event,
        #[flat]
        HostableEvent: HostableComponent::Event,
        #[flat]
        PayableEvent: PayableComponent::Event,
    }

    fn dojo_init(ref self: ContractState, token_address: ContractAddress,) {
        self.payable.initialize(self.world(@"paved").dispatcher, token_address);
    }

    fn build_runtime(
        mode: u8,
        deck_id: u8,
        entry_price: felt252,
        duration_seconds: u64,
        tile_limit: u16,
        allow_discard: bool,
        allow_surrender: bool,
        private_game: bool,
        access_root: felt252,
        metadata_uri_hash: felt252,
    ) -> RuntimeGameConfig {
        RuntimeGameConfig {
            mode,
            deck_id,
            entry_price,
            duration_seconds,
            tile_limit,
            seed_policy: 0,
            scoring_profile_id: 0,
            character_profile_id: 0,
            allow_discard,
            allow_surrender,
            private_game,
            access_root,
            metadata_uri_hash,
        }
    }

    fn next_template_id(self: @ContractState) -> u32 {
        self.world(@"paved").dispatcher.uuid() + 1
    }

    fn assert_admin(store: Store) -> ConfigPolicy {
        let mut policy = store.config_policy();
        let caller: felt252 = get_caller_address().into();

        if policy.admin == 0 {
            policy.admin = caller;
            store.set_config_policy(policy);
            return policy;
        }

        assert(policy.admin == caller, errors::NOT_ADMIN);
        policy
    }

    #[abi(embed_v0)]
    impl ConfigurableImpl of IConfigurable<ContractState> {
        fn register_default_template(self: @ContractState, mode: u8) -> u32 {
            let store: Store = StoreImpl::new(self.world(@"paved").dispatcher);
            let _ = assert_admin(store);
            let mode_enum: Mode = mode.into();
            let runtime = RuntimeGameConfigTrait::default_for_mode(mode_enum);
            let template_id = ConfigTemplatesTrait::default_template_id(mode_enum);
            let existing = store.game_config_template(template_id);
            let version = if existing.config_id == 0 { 1 } else { existing.version + 1 };
            let template = runtime.to_template(template_id, version, true);
            store.set_game_config_template(template);
            template_id
        }

        fn register_template(
            self: @ContractState,
            mode: u8,
            deck_id: u8,
            entry_price: felt252,
            duration_seconds: u64,
            tile_limit: u16,
            allow_discard: bool,
            allow_surrender: bool,
            private_game: bool,
            access_root: felt252,
            metadata_uri_hash: felt252,
        ) -> u32 {
            let store: Store = StoreImpl::new(self.world(@"paved").dispatcher);
            let _ = assert_admin(store);
            let runtime = build_runtime(
                mode,
                deck_id,
                entry_price,
                duration_seconds,
                tile_limit,
                allow_discard,
                allow_surrender,
                private_game,
                access_root,
                metadata_uri_hash,
            );
            runtime.assert_valid(store.config_policy());

            let template_id = next_template_id(self);
            let template = runtime.to_template(template_id, 1, true);
            store.set_game_config_template(template);
            template_id
        }

        fn set_template_enabled(self: @ContractState, template_id: u32, enabled: bool) {
            let store: Store = StoreImpl::new(self.world(@"paved").dispatcher);
            let _ = assert_admin(store);
            let mut template = store.game_config_template(template_id);
            assert(template.config_id != 0, errors::TEMPLATE_NOT_FOUND);
            template.enabled = enabled;
            template.version += 1;
            store.set_game_config_template(template);
        }

        fn create_with_template(self: @ContractState, template_id: u32) -> u32 {
            let store: Store = StoreImpl::new(self.world(@"paved").dispatcher);
            let template = store.game_config_template(template_id);
            assert(template.config_id != 0, errors::TEMPLATE_NOT_FOUND);
            assert(template.enabled, errors::TEMPLATE_DISABLED);
            let runtime = RuntimeGameConfigTrait::runtime_from_template(template);
            runtime.assert_valid(store.config_policy());

            let mode: Mode = runtime.mode.into();
            let (game_id, amount, team_amount, burn_amount) = self
                .hostable
                .spawn_with_runtime(
                    self.world(@"paved").dispatcher,
                    mode,
                    runtime,
                    template.config_id,
                    template_id,
                );
            let caller = get_caller_address();
            self.payable.pay_split(caller, amount, team_amount, burn_amount);
            game_id
        }

        fn create_with_config(
            self: @ContractState,
            mode: u8,
            deck_id: u8,
            entry_price: felt252,
            duration_seconds: u64,
            tile_limit: u16,
            allow_discard: bool,
            allow_surrender: bool,
            private_game: bool,
            access_root: felt252,
            metadata_uri_hash: felt252,
        ) -> u32 {
            let store: Store = StoreImpl::new(self.world(@"paved").dispatcher);
            let policy = store.config_policy();
            assert(policy.allow_custom_config, errors::CUSTOM_CONFIG_DISABLED);

            let runtime = build_runtime(
                mode,
                deck_id,
                entry_price,
                duration_seconds,
                tile_limit,
                allow_discard,
                allow_surrender,
                private_game,
                access_root,
                metadata_uri_hash,
            );
            runtime.assert_valid(policy);

            let mode: Mode = runtime.mode.into();
            let config_id = runtime.config_id();
            let (game_id, amount, team_amount, burn_amount) = self
                .hostable
                .spawn_with_runtime(
                    self.world(@"paved").dispatcher,
                    mode,
                    runtime,
                    config_id,
                    0,
                );
            let caller = get_caller_address();
            self.payable.pay_split(caller, amount, team_amount, burn_amount);
            game_id
        }

        fn preview_validation(
            self: @ContractState,
            mode: u8,
            deck_id: u8,
            entry_price: felt252,
            duration_seconds: u64,
            tile_limit: u16,
            allow_discard: bool,
            allow_surrender: bool,
            private_game: bool,
            access_root: felt252,
            metadata_uri_hash: felt252,
        ) -> u16 {
            let store: Store = StoreImpl::new(self.world(@"paved").dispatcher);
            let runtime = build_runtime(
                mode,
                deck_id,
                entry_price,
                duration_seconds,
                tile_limit,
                allow_discard,
                allow_surrender,
                private_game,
                access_root,
                metadata_uri_hash,
            );
            let result = runtime.validate(store.config_policy());
            result.code
        }

        fn get_effective_config(self: @ContractState, game_id: u32) -> GameConfigSnapshot {
            let store: Store = StoreImpl::new(self.world(@"paved").dispatcher);
            store.game_config_snapshot(game_id)
        }

        fn get_policy(self: @ContractState) -> ConfigPolicy {
            let store: Store = StoreImpl::new(self.world(@"paved").dispatcher);
            store.config_policy()
        }

        fn set_policy(
            self: @ContractState,
            min_duration: u64,
            max_duration: u64,
            max_entry_price: felt252,
            allow_custom_config: bool,
            allow_private_games: bool,
        ) {
            let store: Store = StoreImpl::new(self.world(@"paved").dispatcher);
            let current = assert_admin(store);
            store
                .set_config_policy(
                    ConfigPolicy {
                        id: 1,
                        min_duration,
                        max_duration,
                        max_entry_price,
                        allow_custom_config,
                        allow_private_games,
                        admin: current.admin,
                    }
                );
        }
    }
}
