// The ABIs of contracts/abis/ are imported as plain JSON; `abis.ts` gives them their type.
declare module "*.json" {
  const value: unknown;
  export default value;
}
