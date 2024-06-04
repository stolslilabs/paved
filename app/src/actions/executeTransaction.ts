"use server";
import { GaslessOptions, InvokeResponse } from "@avnu/gasless-sdk";
import { toBeHex } from "ethers";
import { Signature } from "starknet";
import { baseUrl, parseResponse, postRequest, securedPostRequest } from "./";

export default async function executeTransaction(
  userAddress: string,
  typedData: string,
  signature: Signature,
  options?: GaslessOptions,
): Promise<InvokeResponse> {
  if (Array.isArray(signature)) {
    signature = signature.map((sig) => toBeHex(BigInt(sig)));
  } else if (signature.r && signature.s) {
    signature = [toBeHex(BigInt(signature.r)), toBeHex(BigInt(signature.s))];
  }

  const payload = {
    userAddress,
    typedData,
    signature,
  };

  const apiKey = import.meta.env.VITE_PRIVATE_AVNU_API_KEY;

  const body = apiKey
    ? securedPostRequest(payload, apiKey, options)
    : postRequest(payload, options);

  const response = await fetch(
    `${baseUrl(options)}/paymaster/v1/execute`,
    body,
  );

  return parseResponse<InvokeResponse>(response, options?.apiPublicKey);
}
