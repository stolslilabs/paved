import {
  BASE_URL,
  GaslessOptions,
  RequestError,
  SEPOLIA_BASE_URL,
} from "@avnu/gasless-sdk";
import { ec, hash } from "starknet";

const url = SEPOLIA_BASE_URL;
export const baseUrl = (options?: GaslessOptions): string =>
  options?.baseUrl ?? url;

export const getRequest = (options?: GaslessOptions): RequestInit => ({
  signal: options?.abortSignal,
  headers: {
    ...(options?.apiPublicKey !== undefined && { "ask-signature": "true" }),
  },
});

export const postRequest = (
  body: unknown,
  options?: GaslessOptions,
): RequestInit => ({
  method: "POST",
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(options?.apiPublicKey && { "ask-signature": "true" }),
  },
  body: JSON.stringify(body),
});

export const securedPostRequest = (
  body: unknown,
  apiKey: string,
  options?: GaslessOptions,
): RequestInit => ({
  method: "POST",
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    "api-key": apiKey,
    ...(options?.apiPublicKey && { "ask-signature": "true" }),
  },
  body: JSON.stringify(body),
});

export const parseResponse = async <T>(
  response: Response,
  apiPublicKey?: string,
): Promise<T> => {
  if (response.status === 400) {
    const error = await response.json();
    throw new Error(error.messages[0]);
  }
  if (response.status > 400) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  if (apiPublicKey) {
    const signature = response.headers.get("signature");
    if (!signature) throw new Error("No server signature");
    const textResponse = await response.clone().text();
    const hashResponse = hash.computeHashOnElements([
      hash.starknetKeccak(textResponse),
    ]);
    const formattedSig = signature.split(",").map((s) => BigInt(s));
    const signatureType = new ec.starkCurve.Signature(
      formattedSig[0],
      formattedSig[1],
    );
    if (!ec.starkCurve.verify(signatureType, hashResponse, apiPublicKey))
      throw new Error("Invalid server signature");
    return await response.json();
  }
  return response.json();
};
