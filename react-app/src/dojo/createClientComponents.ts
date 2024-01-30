export type ClientComponents = ReturnType<typeof createClientComponents>;

export function createClientComponents({
  contractComponents,
}: {
  contractComponents: any;
}) {
  return {
    ...contractComponents,
  };
}
