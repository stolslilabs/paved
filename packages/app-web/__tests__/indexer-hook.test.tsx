// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { IndexerError, IndexerProvider, useIndexerRead } from "@paved/chain";

afterEach(cleanup);

function Probe({ read }: { read: (c: never) => Promise<never> }) {
  const state = useIndexerRead(read, []);
  return (
    <output data-testid="s">
      {JSON.stringify({ loading: state.loading, error: state.error, kind: state.cause instanceof IndexerError ? state.cause.kind : null, loaded: state.loaded })}
    </output>
  );
}

describe("useIndexerRead", () => {
  it("with no client: rejects with not-configured, is not loading, and sends nothing", async () => {
    const read = vi.fn();
    render(
      <IndexerProvider client={null}>
        <Probe read={read} />
      </IndexerProvider>,
    );
    await waitFor(() => expect(JSON.parse(screen.getByTestId("s").textContent!).kind).toBe("not-configured"));
    expect(JSON.parse(screen.getByTestId("s").textContent!)).toMatchObject({ loading: false, loaded: false });
    expect(read).not.toHaveBeenCalled();
  });
});
