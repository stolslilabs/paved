import { ModeType } from "./mode";

export type FeltLike = string | number | bigint;

export interface GameConfigInput {
  mode: ModeType;
  deckId: number;
  entryPrice: FeltLike;
  durationSeconds: number;
  tileLimit: number;
  allowDiscard: boolean;
  allowSurrender: boolean;
  privateGame: boolean;
  accessRoot: FeltLike;
  metadataUriHash: FeltLike;
}

export interface GameCreateOptions {
  templateId?: number;
  configInput?: GameConfigInput;
}

export function validateGameConfigInput(config: GameConfigInput): string[] {
  const errors: string[] = [];
  if (config.durationSeconds <= 0) errors.push("durationSeconds must be > 0");
  if (config.tileLimit <= 0) errors.push("tileLimit must be > 0");
  if (config.privateGame && BigInt(config.accessRoot) === 0n) {
    errors.push("privateGame requires non-zero accessRoot");
  }
  return errors;
}
