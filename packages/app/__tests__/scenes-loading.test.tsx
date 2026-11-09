import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingScene } from "../src/components/scenes/loading-scene";
import { wrap } from "./scenes-helpers";

describe("Loading", () => {
  it("shows an indeterminate bar while the app boots: no value, the length unknown", () => {
    render(wrap(<LoadingScene />));
    expect(screen.getByRole("progressbar", { name: "Loading" })).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});
