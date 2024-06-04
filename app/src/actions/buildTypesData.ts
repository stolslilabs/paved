"use server";
import { GaslessOptions } from "@avnu/gasless-sdk";
import { Call, TypedData } from "starknet";
import { baseUrl, parseResponse, postRequest, securedPostRequest } from "./";
import { toBeHex } from "ethers";

export default async function buildTypedData(
  userAddress: string,
  calls: Call[],
  gasTokenAddress: string | undefined,
  maxGasTokenAmount: bigint | undefined,
  options?: GaslessOptions,
): Promise<TypedData> {
  const payload = {
    userAddress,
    calls,
    gasTokenAddress,
    ...(maxGasTokenAmount !== undefined && {
      maxGasTokenAmount: toBeHex(maxGasTokenAmount),
    }),
  };

  const apiKey = import.meta.env.VITE_PRIVATE_AVNU_API_KEY;

  const body = apiKey
    ? securedPostRequest(payload, apiKey, options)
    : postRequest(payload, options);

  const response = await fetch(
    `${baseUrl(options)}/paymaster/v1/build-typed-data`,
    body,
  );

  return parseResponse<TypedData>(response, options?.apiPublicKey);
}
