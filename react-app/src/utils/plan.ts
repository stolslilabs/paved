export enum Plan {
  None = "",
  CCCCCCCCC = "CCCCCCCCC",
  CCCCCFFFC = "CCCCFFFC",
  CCCCCFRFC = "CCCCFRFC",
  CFFFCFFFC = "CFFFCFFFC",
  CFFFCFRFC = "CFFFCFRFC",
  FFCFFFCFC = "FFCFFFCFC",
  FFCFFFCFF = "FFCFFFCFF",
  FFCFFFFFC = "FFCFFFFFC",
  FFFFCCCFF = "FFFFCCCFF",
  FFFFFFCFF = "FFFFFFCFF",
  RFFFRFCFR = "RFFFRFCFR",
  RFFFRFFFR = "RFFFRFFFR",
  RFRFCCCFR = "RFRFCCCFR",
  RFRFFFCFF = "RFRFFFCFF",
  RFRFFFCFR = "RFRFFFCFR",
  RFRFFFFFR = "RFRFFFFFR",
  RFRFRFCFF = "RFRFRFCFF",
  SFFFFFFFR = "SFFFFFFFR",
  SFRFRFCFR = "SFRFRFCFR",
  SFRFRFFFR = "SFRFRFFFR",
  SFRFRFRFR = "SFRFRFRFR",
  WCCCCCCCC = "WCCCCCCCC",
  WFFFFFFFF = "WFFFFFFFF",
  WFFFFFFFR = "WFFFFFFFR",
}

export const getPlan = (index: number): Plan => {
  const plans = Object.values(Plan);
  return plans[index];
};

export const getIndex = (plan: Plan): number => {
  return Object.values(Plan).indexOf(plan);
};

export const getCategories = (plan: Plan): string[] => {
  return plan.split("");
};
