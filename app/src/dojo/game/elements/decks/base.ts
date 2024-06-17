import { PlanType } from "../../types/plan";

export class Base {
  public static total_count(): number {
    return 72;
  }

  public static count(): number {
    return 72;
  }

  public static plan(index: number): PlanType {
    const id: number = index % Base.total_count();
    switch (id) {
      case 0:
        return PlanType.CCCCCCCCC;
      case 1:
        return PlanType.CCCCCFFFC;
      case 2:
        return PlanType.CCCCCFFFC;
      case 3:
        return PlanType.CCCCCFFFC;
      case 4:
        return PlanType.CCCCCFFFC;
      case 5:
        return PlanType.CCCCCFRFC;
      case 6:
        return PlanType.CCCCCFRFC;
      case 7:
        return PlanType.CCCCCFRFC;
      case 8:
        return PlanType.CFFFCFFFC;
      case 9:
        return PlanType.CFFFCFFFC;
      case 10:
        return PlanType.CFFFCFFFC;
      case 11:
        return PlanType.FFCFFFCFF;
      case 12:
        return PlanType.FFCFFFCFF;
      case 13:
        return PlanType.FFCFFFCFF;
      case 14:
        return PlanType.FFCFFFFFC;
      case 15:
        return PlanType.FFCFFFFFC;
      case 16:
        return PlanType.FFFFCCCFF;
      case 17:
        return PlanType.FFFFCCCFF;
      case 18:
        return PlanType.FFFFCCCFF;
      case 19:
        return PlanType.FFFFCCCFF;
      case 20:
        return PlanType.FFFFCCCFF;
      case 21:
        return PlanType.FFFFFFCFF;
      case 22:
        return PlanType.FFFFFFCFF;
      case 23:
        return PlanType.FFFFFFCFF;
      case 24:
        return PlanType.FFFFFFCFF;
      case 25:
        return PlanType.FFFFFFCFF;
      case 26:
        return PlanType.RFFFRFCFR;
      case 27:
        return PlanType.RFFFRFCFR;
      case 28:
        return PlanType.RFFFRFCFR;
      case 29:
        return PlanType.RFFFRFCFR;
      case 30:
        return PlanType.RFFFRFFFR;
      case 31:
        return PlanType.RFFFRFFFR;
      case 32:
        return PlanType.RFFFRFFFR;
      case 33:
        return PlanType.RFFFRFFFR;
      case 34:
        return PlanType.RFFFRFFFR;
      case 35:
        return PlanType.RFFFRFFFR;
      case 36:
        return PlanType.RFFFRFFFR;
      case 37:
        return PlanType.RFFFRFFFR;
      case 38:
        return PlanType.RFRFCCCFR;
      case 39:
        return PlanType.RFRFCCCFR;
      case 40:
        return PlanType.RFRFCCCFR;
      case 41:
        return PlanType.RFRFCCCFR;
      case 42:
        return PlanType.RFRFCCCFR;
      case 43:
        return PlanType.RFRFFFCFR;
      case 44:
        return PlanType.RFRFFFCFR;
      case 45:
        return PlanType.RFRFFFCFR;
      case 46:
        return PlanType.RFRFFFFFR;
      case 47:
        return PlanType.RFRFFFFFR;
      case 48:
        return PlanType.RFRFFFFFR;
      case 49:
        return PlanType.RFRFFFFFR;
      case 50:
        return PlanType.RFRFFFFFR;
      case 51:
        return PlanType.RFRFFFFFR;
      case 52:
        return PlanType.RFRFFFFFR;
      case 53:
        return PlanType.RFRFFFFFR;
      case 54:
        return PlanType.RFRFFFFFR;
      case 55:
        return PlanType.RFRFRFCFF;
      case 56:
        return PlanType.RFRFRFCFF;
      case 57:
        return PlanType.RFRFRFCFF;
      case 58:
        return PlanType.SFRFRFCFR;
      case 59:
        return PlanType.SFRFRFCFR;
      case 60:
        return PlanType.SFRFRFCFR;
      case 61:
        return PlanType.SFRFRFFFR;
      case 62:
        return PlanType.SFRFRFFFR;
      case 63:
        return PlanType.SFRFRFFFR;
      case 64:
        return PlanType.SFRFRFFFR;
      case 65:
        return PlanType.SFRFRFRFR;
      case 66:
        return PlanType.WFFFFFFFF;
      case 67:
        return PlanType.WFFFFFFFF;
      case 68:
        return PlanType.WFFFFFFFF;
      case 69:
        return PlanType.WFFFFFFFF;
      case 70:
        return PlanType.WFFFFFFFR;
      case 71:
        return PlanType.WFFFFFFFR;
      default:
        return PlanType.None;
    }
  }
}
