//! `Collection`, the soulbound ERC721 of the games (P8 E5a, `docs/architecture/economy.md` section
//! 9).
//!
//! Every game is a token of this contract and its owner never changes: `transfer_from`,
//! `safe_transfer_from`, `approve` and `set_approval_for_all` (and their camelCase twins) revert
//! for every token, minted or not. There is no burn and no internal transfer.
//!
//! Token ids: a Daily game's token id is its game id; a Tutorial game's token id is
//! `TUTORIAL_OFFSET + game id` (`Daily` and `Tutorial` count their own game ids, so the same game
//! id exists twice). `mint` and `token_uri` route by that range. Only `Daily` mints Daily ids and
//! only `Tutorial` mints Tutorial ids; both are set once by the owner (`set_minters`). The mint is
//! a plain mint: no receiver callback.
//!
//! `token_uri` returns `data:application/json;base64,` + the base64 of the JSON of section 9, read
//! from the `game` view of the game contract the id belongs to. It has no `image` yet.

// Starknet imports

use starknet::ContractAddress;

// Constants

/// Token ids from this value up are Tutorial games (`TUTORIAL_OFFSET + game id`).
pub const TUTORIAL_OFFSET: u256 = 0x100000000;
/// The first token id that belongs to no game contract.
pub const TOKEN_LIMIT: u256 = 0x200000000;

#[starknet::interface]
pub trait ICollection<TContractState> {
    /// Sets the two minters, once. Owner only.
    fn set_minters(ref self: TContractState, daily: ContractAddress, tutorial: ContractAddress);
    /// Mints `token_id` to `to`. The minter of the id's range only.
    fn mint(ref self: TContractState, to: ContractAddress, token_id: u256);
    fn owner(self: @TContractState) -> ContractAddress;
    fn daily(self: @TContractState) -> ContractAddress;
    fn tutorial(self: @TContractState) -> ContractAddress;
}

#[starknet::interface]
pub trait IERC721Soulbound<TContractState> {
    fn balance_of(self: @TContractState, account: ContractAddress) -> u256;
    fn owner_of(self: @TContractState, token_id: u256) -> ContractAddress;
    fn safe_transfer_from(
        ref self: TContractState,
        from: ContractAddress,
        to: ContractAddress,
        token_id: u256,
        data: Span<felt252>,
    );
    fn transfer_from(
        ref self: TContractState, from: ContractAddress, to: ContractAddress, token_id: u256,
    );
    fn approve(ref self: TContractState, to: ContractAddress, token_id: u256);
    fn set_approval_for_all(ref self: TContractState, operator: ContractAddress, approved: bool);
    fn get_approved(self: @TContractState, token_id: u256) -> ContractAddress;
    fn is_approved_for_all(
        self: @TContractState, owner: ContractAddress, operator: ContractAddress,
    ) -> bool;
}

#[starknet::interface]
pub trait IERC721SoulboundCamel<TContractState> {
    fn balanceOf(self: @TContractState, account: ContractAddress) -> u256;
    fn ownerOf(self: @TContractState, tokenId: u256) -> ContractAddress;
    fn safeTransferFrom(
        ref self: TContractState,
        from: ContractAddress,
        to: ContractAddress,
        tokenId: u256,
        data: Span<felt252>,
    );
    fn transferFrom(
        ref self: TContractState, from: ContractAddress, to: ContractAddress, tokenId: u256,
    );
    fn setApprovalForAll(ref self: TContractState, operator: ContractAddress, approved: bool);
    fn getApproved(self: @TContractState, tokenId: u256) -> ContractAddress;
    fn isApprovedForAll(
        self: @TContractState, owner: ContractAddress, operator: ContractAddress,
    ) -> bool;
}

#[starknet::interface]
pub trait IERC721MetadataSoulbound<TContractState> {
    fn name(self: @TContractState) -> ByteArray;
    fn symbol(self: @TContractState) -> ByteArray;
    fn token_uri(self: @TContractState, token_id: u256) -> ByteArray;
    fn tokenURI(self: @TContractState, tokenId: u256) -> ByteArray;
}

#[starknet::interface]
pub trait ISRC5Soulbound<TContractState> {
    fn supports_interface(self: @TContractState, interface_id: felt252) -> bool;
}

/// The JSON of `token_uri` and its base64, free of storage so that it is testable alone.
pub mod metadata {
    pub fn uri_prefix() -> ByteArray {
        "data:application/json;base64,"
    }

    fn alphabet() -> ByteArray {
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    }

    /// The decimal text of `value`.
    pub fn decimal(value: u64) -> ByteArray {
        if value == 0 {
            return "0";
        }
        let mut digits: Array<u8> = array![];
        let mut rest = value;
        while rest != 0 {
            digits.append((rest % 10).try_into().unwrap());
            rest /= 10;
        }
        let mut text: ByteArray = "";
        let mut i = digits.len();
        while i != 0 {
            i -= 1;
            text.append_byte(48 + *digits.at(i));
        }
        text
    }

    /// The JSON of a game: `id` is the token id, `day` the tournament day.
    pub fn json(token_id: u256, score: u32, over: bool, day: u64) -> ByteArray {
        let id: u64 = token_id.try_into().unwrap();
        let mut text: ByteArray = "{\"name\":\"Paved Games #";
        text.append(@decimal(id));
        text.append(@"\",\"description\":\"A game of Paved.\",\"attributes\":[");
        text.append(@"{\"trait_type\":\"Score\",\"value\":");
        text.append(@decimal(score.into()));
        text.append(@"},{\"trait_type\":\"Over\",\"value\":");
        text.append(@if over {
            "true"
        } else {
            "false"
        });
        text.append(@"},{\"trait_type\":\"Day\",\"value\":");
        text.append(@decimal(day));
        text.append(@"}]}");
        text
    }

    fn sextet(alphabet: @ByteArray, index: u32) -> u8 {
        alphabet.at(index).unwrap()
    }

    /// The standard base64 of `input`, padded with `=`.
    pub fn base64(input: @ByteArray) -> ByteArray {
        let alphabet = alphabet();
        let mut out: ByteArray = "";
        let length = input.len();
        let mut i = 0;
        while i < length {
            let b0: u32 = input.at(i).unwrap().into();
            let has1 = i + 1 < length;
            let has2 = i + 2 < length;
            let b1: u32 = if has1 {
                input.at(i + 1).unwrap().into()
            } else {
                0
            };
            let b2: u32 = if has2 {
                input.at(i + 2).unwrap().into()
            } else {
                0
            };
            let n = b0 * 65536 + b1 * 256 + b2;
            out.append_byte(sextet(@alphabet, n / 262144));
            out.append_byte(sextet(@alphabet, (n / 4096) % 64));
            if has1 {
                out.append_byte(sextet(@alphabet, (n / 64) % 64));
            } else {
                out.append_byte(61);
            }
            if has2 {
                out.append_byte(sextet(@alphabet, n % 64));
            } else {
                out.append_byte(61);
            }
            i += 3;
        }
        out
    }
}

#[starknet::contract]
pub mod Collection {
    // Core imports

    use core::num::traits::Zero;

    // External imports

    use openzeppelin_interfaces::introspection::ISRC5_ID;
    use openzeppelin_interfaces::token::erc721::{IERC721_ID, IERC721_METADATA_ID};

    // Internal imports

    use paved::views::{GameView, IGameViewDispatcher, IGameViewDispatcherTrait};

    // Starknet imports

    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};

    // Local imports

    use super::{
        ICollection, IERC721MetadataSoulbound, IERC721Soulbound, IERC721SoulboundCamel,
        ISRC5Soulbound, TOKEN_LIMIT, TUTORIAL_OFFSET, metadata,
    };

    // Errors

    pub mod errors {
        pub const NOT_OWNER: felt252 = 'Collection: not owner';
        pub const MINTERS_SET: felt252 = 'Collection: minters set';
        pub const ZERO_MINTER: felt252 = 'Collection: zero minter';
        pub const SAME_MINTER: felt252 = 'Collection: same minter';
        pub const NOT_MINTER: felt252 = 'Collection: not minter';
        pub const INVALID_TOKEN: felt252 = 'Collection: invalid token';
        pub const ALREADY_MINTED: felt252 = 'Collection: already minted';
        pub const ZERO_RECIPIENT: felt252 = 'Collection: zero recipient';
        pub const ZERO_ACCOUNT: felt252 = 'Collection: zero account';
        pub const ZERO_OWNER: felt252 = 'Collection: zero owner';
        pub const SOULBOUND: felt252 = 'Collection: soulbound';
    }

    // Storage

    #[storage]
    struct Storage {
        owner: ContractAddress,
        daily: ContractAddress,
        tutorial: ContractAddress,
        owners: Map<u256, ContractAddress>,
        balances: Map<ContractAddress, u256>,
    }

    // Events

    /// OpenZeppelin's layout: all three fields are keys. Emitted at mint only (`from` is zero).
    #[derive(Drop, starknet::Event)]
    pub struct Transfer {
        #[key]
        pub from: ContractAddress,
        #[key]
        pub to: ContractAddress,
        #[key]
        pub token_id: u256,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Transfer: Transfer,
    }

    // Constructor

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        assert(owner.is_non_zero(), errors::ZERO_OWNER);
        self.owner.write(owner);
    }

    // Internal

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn assert_minted(self: @ContractState, token_id: u256) -> ContractAddress {
            let owner = self.owners.read(token_id);
            assert(owner.is_non_zero(), errors::INVALID_TOKEN);
            owner
        }

        /// The metadata of `token_id` from the `game` view of the contract its range belongs to.
        fn uri(self: @ContractState, token_id: u256) -> ByteArray {
            self.assert_minted(token_id);
            let (contract, game_id) = if token_id < TUTORIAL_OFFSET {
                (self.daily.read(), token_id)
            } else {
                (self.tutorial.read(), token_id - TUTORIAL_OFFSET)
            };
            let game: GameView = IGameViewDispatcher { contract_address: contract }
                .game(game_id.try_into().unwrap());
            let json = metadata::json(token_id, game.score, game.over, game.start_time / 86400);
            let mut uri = metadata::uri_prefix();
            ByteArrayTrait::append(ref uri, @metadata::base64(@json));
            uri
        }
    }

    // Implementations

    #[abi(embed_v0)]
    impl CollectionImpl of ICollection<ContractState> {
        fn set_minters(ref self: ContractState, daily: ContractAddress, tutorial: ContractAddress) {
            assert(get_caller_address() == self.owner.read(), errors::NOT_OWNER);
            assert(self.daily.read().is_zero(), errors::MINTERS_SET);
            assert(daily.is_non_zero() && tutorial.is_non_zero(), errors::ZERO_MINTER);
            // [Check] Two contracts: one address minting both ranges would defeat the split
            assert(daily != tutorial, errors::SAME_MINTER);
            self.daily.write(daily);
            self.tutorial.write(tutorial);
        }

        fn mint(ref self: ContractState, to: ContractAddress, token_id: u256) {
            assert(token_id.high == 0 && token_id < TOKEN_LIMIT, errors::INVALID_TOKEN);
            let minter = if token_id < TUTORIAL_OFFSET {
                self.daily.read()
            } else {
                self.tutorial.read()
            };
            // Before `set_minters` the minter is zero and no caller is.
            assert(minter.is_non_zero() && get_caller_address() == minter, errors::NOT_MINTER);
            assert(to.is_non_zero(), errors::ZERO_RECIPIENT);
            assert(self.owners.read(token_id).is_zero(), errors::ALREADY_MINTED);
            self.owners.write(token_id, to);
            self.balances.write(to, self.balances.read(to) + 1);
            self.emit(Transfer { from: Zero::zero(), to, token_id });
        }

        fn owner(self: @ContractState) -> ContractAddress {
            self.owner.read()
        }

        fn daily(self: @ContractState) -> ContractAddress {
            self.daily.read()
        }

        fn tutorial(self: @ContractState) -> ContractAddress {
            self.tutorial.read()
        }
    }

    #[abi(embed_v0)]
    impl ERC721Impl of IERC721Soulbound<ContractState> {
        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            assert(account.is_non_zero(), errors::ZERO_ACCOUNT);
            self.balances.read(account)
        }

        fn owner_of(self: @ContractState, token_id: u256) -> ContractAddress {
            self.assert_minted(token_id)
        }

        fn safe_transfer_from(
            ref self: ContractState,
            from: ContractAddress,
            to: ContractAddress,
            token_id: u256,
            data: Span<felt252>,
        ) {
            core::panic_with_felt252(errors::SOULBOUND);
        }

        fn transfer_from(
            ref self: ContractState, from: ContractAddress, to: ContractAddress, token_id: u256,
        ) {
            core::panic_with_felt252(errors::SOULBOUND);
        }

        fn approve(ref self: ContractState, to: ContractAddress, token_id: u256) {
            core::panic_with_felt252(errors::SOULBOUND);
        }

        fn set_approval_for_all(
            ref self: ContractState, operator: ContractAddress, approved: bool,
        ) {
            core::panic_with_felt252(errors::SOULBOUND);
        }

        fn get_approved(self: @ContractState, token_id: u256) -> ContractAddress {
            Zero::zero()
        }

        fn is_approved_for_all(
            self: @ContractState, owner: ContractAddress, operator: ContractAddress,
        ) -> bool {
            false
        }
    }

    #[abi(embed_v0)]
    impl ERC721CamelImpl of IERC721SoulboundCamel<ContractState> {
        fn balanceOf(self: @ContractState, account: ContractAddress) -> u256 {
            ERC721Impl::balance_of(self, account)
        }

        fn ownerOf(self: @ContractState, tokenId: u256) -> ContractAddress {
            self.assert_minted(tokenId)
        }

        fn safeTransferFrom(
            ref self: ContractState,
            from: ContractAddress,
            to: ContractAddress,
            tokenId: u256,
            data: Span<felt252>,
        ) {
            core::panic_with_felt252(errors::SOULBOUND);
        }

        fn transferFrom(
            ref self: ContractState, from: ContractAddress, to: ContractAddress, tokenId: u256,
        ) {
            core::panic_with_felt252(errors::SOULBOUND);
        }

        fn setApprovalForAll(ref self: ContractState, operator: ContractAddress, approved: bool) {
            core::panic_with_felt252(errors::SOULBOUND);
        }

        fn getApproved(self: @ContractState, tokenId: u256) -> ContractAddress {
            Zero::zero()
        }

        fn isApprovedForAll(
            self: @ContractState, owner: ContractAddress, operator: ContractAddress,
        ) -> bool {
            false
        }
    }

    #[abi(embed_v0)]
    impl MetadataImpl of IERC721MetadataSoulbound<ContractState> {
        fn name(self: @ContractState) -> ByteArray {
            "Paved Games"
        }

        fn symbol(self: @ContractState) -> ByteArray {
            "PAVEDGAME"
        }

        fn token_uri(self: @ContractState, token_id: u256) -> ByteArray {
            self.uri(token_id)
        }

        fn tokenURI(self: @ContractState, tokenId: u256) -> ByteArray {
            self.uri(tokenId)
        }
    }

    #[abi(embed_v0)]
    impl SRC5Impl of ISRC5Soulbound<ContractState> {
        fn supports_interface(self: @ContractState, interface_id: felt252) -> bool {
            interface_id == ISRC5_ID
                || interface_id == IERC721_ID
                || interface_id == IERC721_METADATA_ID
        }
    }
}
