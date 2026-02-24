import { DojoProvider, DojoCall } from "@dojoengine/core";
import { Account, AccountInterface, BigNumberish, CairoOption, CairoCustomEnum } from "starknet";
import * as models from "./models.gen";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setupWorld(provider: DojoProvider): Record<string, any> {

	const build_Account_create_calldata = (name: BigNumberish, master: string): DojoCall => {
		return {
			contractName: "Account",
			entrypoint: "create",
			calldata: [name, master],
		};
	};

	const Account_create = async (name: BigNumberish, master: string) => {
		try {
			return await provider.call("paved", build_Account_create_calldata(name, master));
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Daily_build_calldata = (gameId: BigNumberish, orientation: CairoCustomEnum, x: BigNumberish, y: BigNumberish, role: CairoCustomEnum, spot: CairoCustomEnum): DojoCall => {
		return {
			contractName: "Daily",
			entrypoint: "build",
			calldata: [gameId, orientation, x, y, role, spot],
		};
	};

	const Daily_build = async (gameId: BigNumberish, orientation: CairoCustomEnum, x: BigNumberish, y: BigNumberish, role: CairoCustomEnum, spot: CairoCustomEnum) => {
		try {
			return await provider.call("paved", build_Daily_build_calldata(gameId, orientation, x, y, role, spot));
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Daily_claim_calldata = (tournamentId: BigNumberish, rank: BigNumberish): DojoCall => {
		return {
			contractName: "Daily",
			entrypoint: "claim",
			calldata: [tournamentId, rank],
		};
	};

	const Daily_claim = async (tournamentId: BigNumberish, rank: BigNumberish) => {
		try {
			return await provider.call("paved", build_Daily_claim_calldata(tournamentId, rank));
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Daily_discard_calldata = (gameId: BigNumberish): DojoCall => {
		return {
			contractName: "Daily",
			entrypoint: "discard",
			calldata: [gameId],
		};
	};

	const Daily_discard = async (gameId: BigNumberish) => {
		try {
			return await provider.call("paved", build_Daily_discard_calldata(gameId));
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Daily_spawn_calldata = (): DojoCall => {
		return {
			contractName: "Daily",
			entrypoint: "spawn",
			calldata: [],
		};
	};

	const Daily_spawn = async () => {
		try {
			return await provider.call("paved", build_Daily_spawn_calldata());
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Daily_sponsor_calldata = (amount: BigNumberish): DojoCall => {
		return {
			contractName: "Daily",
			entrypoint: "sponsor",
			calldata: [amount],
		};
	};

	const Daily_sponsor = async (amount: BigNumberish) => {
		try {
			return await provider.call("paved", build_Daily_sponsor_calldata(amount));
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Daily_surrender_calldata = (gameId: BigNumberish): DojoCall => {
		return {
			contractName: "Daily",
			entrypoint: "surrender",
			calldata: [gameId],
		};
	};

	const Daily_surrender = async (gameId: BigNumberish) => {
		try {
			return await provider.call("paved", build_Daily_surrender_calldata(gameId));
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Token_allowance_calldata = (owner: string, spender: string): DojoCall => {
		return {
			contractName: "Token",
			entrypoint: "allowance",
			calldata: [owner, spender],
		};
	};

	const Token_allowance = async (owner: string, spender: string) => {
		try {
			return await provider.call("paved", build_Token_allowance_calldata(owner, spender));
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Token_approve_calldata = (spender: string, amount: BigNumberish): DojoCall => {
		return {
			contractName: "Token",
			entrypoint: "approve",
			calldata: [spender, amount],
		};
	};

	const Token_approve = async (snAccount: Account | AccountInterface, spender: string, amount: BigNumberish) => {
		try {
			return await provider.execute(
				snAccount as any,
				build_Token_approve_calldata(spender, amount),
				"paved",
			);
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Token_balanceOf_calldata = (account: string): DojoCall => {
		return {
			contractName: "Token",
			entrypoint: "balanceOf",
			calldata: [account],
		};
	};

	const Token_balanceOf = async (account: string) => {
		try {
			return await provider.call("paved", build_Token_balanceOf_calldata(account));
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Token_decimals_calldata = (): DojoCall => {
		return {
			contractName: "Token",
			entrypoint: "decimals",
			calldata: [],
		};
	};

	const Token_decimals = async () => {
		try {
			return await provider.call("paved", build_Token_decimals_calldata());
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Token_mint_calldata = (): DojoCall => {
		return {
			contractName: "Token",
			entrypoint: "mint",
			calldata: [],
		};
	};

	const Token_mint = async (snAccount: Account | AccountInterface) => {
		try {
			return await provider.execute(
				snAccount as any,
				build_Token_mint_calldata(),
				"paved",
			);
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Token_name_calldata = (): DojoCall => {
		return {
			contractName: "Token",
			entrypoint: "name",
			calldata: [],
		};
	};

	const Token_name = async () => {
		try {
			return await provider.call("paved", build_Token_name_calldata());
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Token_symbol_calldata = (): DojoCall => {
		return {
			contractName: "Token",
			entrypoint: "symbol",
			calldata: [],
		};
	};

	const Token_symbol = async () => {
		try {
			return await provider.call("paved", build_Token_symbol_calldata());
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Token_totalSupply_calldata = (): DojoCall => {
		return {
			contractName: "Token",
			entrypoint: "totalSupply",
			calldata: [],
		};
	};

	const Token_totalSupply = async () => {
		try {
			return await provider.call("paved", build_Token_totalSupply_calldata());
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Token_transfer_calldata = (recipient: string, amount: BigNumberish): DojoCall => {
		return {
			contractName: "Token",
			entrypoint: "transfer",
			calldata: [recipient, amount],
		};
	};

	const Token_transfer = async (snAccount: Account | AccountInterface, recipient: string, amount: BigNumberish) => {
		try {
			return await provider.execute(
				snAccount as any,
				build_Token_transfer_calldata(recipient, amount),
				"paved",
			);
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Token_transferFrom_calldata = (sender: string, recipient: string, amount: BigNumberish): DojoCall => {
		return {
			contractName: "Token",
			entrypoint: "transferFrom",
			calldata: [sender, recipient, amount],
		};
	};

	const Token_transferFrom = async (snAccount: Account | AccountInterface, sender: string, recipient: string, amount: BigNumberish) => {
		try {
			return await provider.execute(
				snAccount as any,
				build_Token_transferFrom_calldata(sender, recipient, amount),
				"paved",
			);
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Tutorial_build_calldata = (gameId: BigNumberish): DojoCall => {
		return {
			contractName: "Tutorial",
			entrypoint: "build",
			calldata: [gameId],
		};
	};

	const Tutorial_build = async (gameId: BigNumberish) => {
		try {
			return await provider.call("paved", build_Tutorial_build_calldata(gameId));
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Tutorial_discard_calldata = (gameId: BigNumberish): DojoCall => {
		return {
			contractName: "Tutorial",
			entrypoint: "discard",
			calldata: [gameId],
		};
	};

	const Tutorial_discard = async (gameId: BigNumberish) => {
		try {
			return await provider.call("paved", build_Tutorial_discard_calldata(gameId));
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Tutorial_spawn_calldata = (): DojoCall => {
		return {
			contractName: "Tutorial",
			entrypoint: "spawn",
			calldata: [],
		};
	};

	const Tutorial_spawn = async () => {
		try {
			return await provider.call("paved", build_Tutorial_spawn_calldata());
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Tutorial_surrender_calldata = (gameId: BigNumberish): DojoCall => {
		return {
			contractName: "Tutorial",
			entrypoint: "surrender",
			calldata: [gameId],
		};
	};

	const Tutorial_surrender = async (gameId: BigNumberish) => {
		try {
			return await provider.call("paved", build_Tutorial_surrender_calldata(gameId));
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Weekly_build_calldata = (gameId: BigNumberish, orientation: CairoCustomEnum, x: BigNumberish, y: BigNumberish, role: CairoCustomEnum, spot: CairoCustomEnum): DojoCall => {
		return {
			contractName: "Weekly",
			entrypoint: "build",
			calldata: [gameId, orientation, x, y, role, spot],
		};
	};

	const Weekly_build = async (gameId: BigNumberish, orientation: CairoCustomEnum, x: BigNumberish, y: BigNumberish, role: CairoCustomEnum, spot: CairoCustomEnum) => {
		try {
			return await provider.call("paved", build_Weekly_build_calldata(gameId, orientation, x, y, role, spot));
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Weekly_claim_calldata = (tournamentId: BigNumberish, rank: BigNumberish): DojoCall => {
		return {
			contractName: "Weekly",
			entrypoint: "claim",
			calldata: [tournamentId, rank],
		};
	};

	const Weekly_claim = async (tournamentId: BigNumberish, rank: BigNumberish) => {
		try {
			return await provider.call("paved", build_Weekly_claim_calldata(tournamentId, rank));
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Weekly_discard_calldata = (gameId: BigNumberish): DojoCall => {
		return {
			contractName: "Weekly",
			entrypoint: "discard",
			calldata: [gameId],
		};
	};

	const Weekly_discard = async (gameId: BigNumberish) => {
		try {
			return await provider.call("paved", build_Weekly_discard_calldata(gameId));
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Weekly_spawn_calldata = (): DojoCall => {
		return {
			contractName: "Weekly",
			entrypoint: "spawn",
			calldata: [],
		};
	};

	const Weekly_spawn = async () => {
		try {
			return await provider.call("paved", build_Weekly_spawn_calldata());
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Weekly_sponsor_calldata = (amount: BigNumberish): DojoCall => {
		return {
			contractName: "Weekly",
			entrypoint: "sponsor",
			calldata: [amount],
		};
	};

	const Weekly_sponsor = async (amount: BigNumberish) => {
		try {
			return await provider.call("paved", build_Weekly_sponsor_calldata(amount));
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_Weekly_surrender_calldata = (gameId: BigNumberish): DojoCall => {
		return {
			contractName: "Weekly",
			entrypoint: "surrender",
			calldata: [gameId],
		};
	};

	const Weekly_surrender = async (gameId: BigNumberish) => {
		try {
			return await provider.call("paved", build_Weekly_surrender_calldata(gameId));
		} catch (error) {
			console.error(error);
			throw error;
		}
	};



	return {
		Account: {
			create: Account_create,
			buildCreateCalldata: build_Account_create_calldata,
		},
		Daily: {
			build: Daily_build,
			buildBuildCalldata: build_Daily_build_calldata,
			claim: Daily_claim,
			buildClaimCalldata: build_Daily_claim_calldata,
			discard: Daily_discard,
			buildDiscardCalldata: build_Daily_discard_calldata,
			spawn: Daily_spawn,
			buildSpawnCalldata: build_Daily_spawn_calldata,
			sponsor: Daily_sponsor,
			buildSponsorCalldata: build_Daily_sponsor_calldata,
			surrender: Daily_surrender,
			buildSurrenderCalldata: build_Daily_surrender_calldata,
		},
		Token: {
			allowance: Token_allowance,
			buildAllowanceCalldata: build_Token_allowance_calldata,
			approve: Token_approve,
			buildApproveCalldata: build_Token_approve_calldata,
			balanceOf: Token_balanceOf,
			buildBalanceOfCalldata: build_Token_balanceOf_calldata,
			decimals: Token_decimals,
			buildDecimalsCalldata: build_Token_decimals_calldata,
			mint: Token_mint,
			buildMintCalldata: build_Token_mint_calldata,
			name: Token_name,
			buildNameCalldata: build_Token_name_calldata,
			symbol: Token_symbol,
			buildSymbolCalldata: build_Token_symbol_calldata,
			totalSupply: Token_totalSupply,
			buildTotalSupplyCalldata: build_Token_totalSupply_calldata,
			transfer: Token_transfer,
			buildTransferCalldata: build_Token_transfer_calldata,
			transferFrom: Token_transferFrom,
			buildTransferFromCalldata: build_Token_transferFrom_calldata,
		},
		Tutorial: {
			build: Tutorial_build,
			buildBuildCalldata: build_Tutorial_build_calldata,
			discard: Tutorial_discard,
			buildDiscardCalldata: build_Tutorial_discard_calldata,
			spawn: Tutorial_spawn,
			buildSpawnCalldata: build_Tutorial_spawn_calldata,
			surrender: Tutorial_surrender,
			buildSurrenderCalldata: build_Tutorial_surrender_calldata,
		},
		Weekly: {
			build: Weekly_build,
			buildBuildCalldata: build_Weekly_build_calldata,
			claim: Weekly_claim,
			buildClaimCalldata: build_Weekly_claim_calldata,
			discard: Weekly_discard,
			buildDiscardCalldata: build_Weekly_discard_calldata,
			spawn: Weekly_spawn,
			buildSpawnCalldata: build_Weekly_spawn_calldata,
			sponsor: Weekly_sponsor,
			buildSponsorCalldata: build_Weekly_sponsor_calldata,
			surrender: Weekly_surrender,
			buildSurrenderCalldata: build_Weekly_surrender_calldata,
		},
	};
}