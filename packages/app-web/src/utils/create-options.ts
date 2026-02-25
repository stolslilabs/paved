import {
  Mode,
  ModeType,
  type GameConfigInput,
  type GameCreateOptions,
  validateGameConfigInput,
} from "@paved/game-core";

export type CreatePath = "legacy" | "template" | "custom";

export interface CreateResolution {
  createPath: CreatePath;
  options?: GameCreateOptions;
  fieldErrors: Record<string, string>;
}

function defaultDeckId(mode: ModeType): number {
  switch (mode) {
    case ModeType.Daily:
      return 2;
    case ModeType.Weekly:
      return 1;
    case ModeType.Tutorial:
      return 3;
    default:
      return 0;
  }
}

export function defaultConfigForMode(mode: ModeType): GameConfigInput {
  const modeData = new Mode(mode);
  return {
    mode,
    deckId: defaultDeckId(mode),
    entryPrice: modeData.price(),
    durationSeconds: modeData.duration(),
    tileLimit: modeData.count(),
    allowDiscard: true,
    allowSurrender: true,
    privateGame: false,
    accessRoot: 0n,
    metadataUriHash: 0n,
  };
}

function boolFromParam(value: string | null, fallback: boolean): boolean {
  if (value == null) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

function intFromParam(value: string | null, fallback: number): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function feltFromParam(value: string | null, fallback: bigint): bigint {
  if (value == null || value.trim() === "") return fallback;
  try {
    return BigInt(value);
  } catch {
    return fallback;
  }
}

function mapValidationErrors(errors: string[]): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const error of errors) {
    if (error.includes("durationSeconds")) fieldErrors.durationSeconds = error;
    else if (error.includes("tileLimit")) fieldErrors.tileLimit = error;
    else if (error.includes("accessRoot")) fieldErrors.accessRoot = error;
    else fieldErrors.general = error;
  }
  return fieldErrors;
}

export function buildCreateGameRoute(
  mode: ModeType,
  createPath: CreatePath,
  templateId?: number,
  configInput?: GameConfigInput,
): string {
  const search = new URLSearchParams({ mode });
  if (createPath !== "legacy") search.set("create", createPath);

  if (createPath === "template" && templateId && templateId > 0) {
    search.set("templateId", String(templateId));
  }

  if (createPath === "custom" && configInput) {
    search.set("cfgDeckId", String(configInput.deckId));
    search.set("cfgEntryPrice", String(configInput.entryPrice));
    search.set("cfgDuration", String(configInput.durationSeconds));
    search.set("cfgTileLimit", String(configInput.tileLimit));
    search.set("cfgAllowDiscard", configInput.allowDiscard ? "1" : "0");
    search.set("cfgAllowSurrender", configInput.allowSurrender ? "1" : "0");
    search.set("cfgPrivateGame", configInput.privateGame ? "1" : "0");
    search.set("cfgAccessRoot", String(configInput.accessRoot));
    search.set("cfgMetadataUriHash", String(configInput.metadataUriHash));
  }

  return `/game?${search.toString()}`;
}

export function resolveCreateOptions(
  mode: ModeType,
  searchParams: URLSearchParams,
  advancedConfigEnabled: boolean,
): CreateResolution {
  const createParam = searchParams.get("create");
  const createPath: CreatePath =
    createParam === "template" || createParam === "custom" ? createParam : "legacy";

  if (createPath === "template") {
    const templateId = intFromParam(searchParams.get("templateId"), 0);
    if (!Number.isInteger(templateId) || templateId <= 0) {
      return {
        createPath,
        fieldErrors: { templateId: "templateId must be a positive integer" },
      };
    }
    return {
      createPath,
      options: { templateId },
      fieldErrors: {},
    };
  }

  if (createPath === "custom") {
    if (!advancedConfigEnabled) {
      return {
        createPath,
        fieldErrors: { general: "Advanced config is disabled" },
      };
    }

    const fallback = defaultConfigForMode(mode);
    const configInput: GameConfigInput = {
      mode,
      deckId: intFromParam(searchParams.get("cfgDeckId"), fallback.deckId),
      entryPrice: feltFromParam(searchParams.get("cfgEntryPrice"), BigInt(fallback.entryPrice)),
      durationSeconds: intFromParam(searchParams.get("cfgDuration"), fallback.durationSeconds),
      tileLimit: intFromParam(searchParams.get("cfgTileLimit"), fallback.tileLimit),
      allowDiscard: boolFromParam(searchParams.get("cfgAllowDiscard"), fallback.allowDiscard),
      allowSurrender: boolFromParam(searchParams.get("cfgAllowSurrender"), fallback.allowSurrender),
      privateGame: boolFromParam(searchParams.get("cfgPrivateGame"), fallback.privateGame),
      accessRoot: feltFromParam(searchParams.get("cfgAccessRoot"), BigInt(fallback.accessRoot)),
      metadataUriHash: feltFromParam(
        searchParams.get("cfgMetadataUriHash"),
        BigInt(fallback.metadataUriHash),
      ),
    };

    const errors = validateGameConfigInput(configInput);
    if (errors.length > 0) {
      return {
        createPath,
        fieldErrors: mapValidationErrors(errors),
      };
    }

    return {
      createPath,
      options: { configInput },
      fieldErrors: {},
    };
  }

  return {
    createPath: "legacy",
    fieldErrors: {},
  };
}
