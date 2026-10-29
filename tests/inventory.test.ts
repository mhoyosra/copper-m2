// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// readInventory() asks Supabase for the table. These tests swap the Supabase
// client for a fake, so they check what readInventory() does with each answer.
const { createStatelessClient } = vi.hoisted(() => ({
  createStatelessClient: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createStatelessClient }));

const { readInventory } = await import("@/lib/copper/inventory");

const row = {
  sku: "CH-TEA",
  product: "Copper Home",
  color: "Patina Teal",
  units_in_stock: 6,
  next_shipment: "2026-11-06",
};

/** A fake client whose `from("inventory").select("*")` answers with `answer`. */
function clientAnswering(answer: unknown) {
  const select = vi.fn(async () => answer);
  const from = vi.fn(() => ({ select }));
  return { client: { from }, from, select };
}

describe("readInventory", () => {
  beforeEach(() => createStatelessClient.mockReset());

  it("returns every row of the inventory table", async () => {
    const { client, from, select } = clientAnswering({ data: [row], error: null });
    createStatelessClient.mockReturnValue(client);

    expect(await readInventory()).toEqual([row]);
    expect(from).toHaveBeenCalledWith("inventory");
    expect(select).toHaveBeenCalledWith("*");
  });

  it("returns an empty list, not null, when the table has no rows", async () => {
    createStatelessClient.mockReturnValue(
      clientAnswering({ data: [], error: null }).client,
    );
    expect(await readInventory()).toEqual([]);
  });

  it("returns null when Supabase isn't set up", async () => {
    createStatelessClient.mockReturnValue(null);
    expect(await readInventory()).toBeNull();
  });

  it("returns null when Supabase answers with an error", async () => {
    createStatelessClient.mockReturnValue(
      clientAnswering({ data: null, error: { message: "boom" } }).client,
    );
    expect(await readInventory()).toBeNull();
  });

  it("returns null when the request throws", async () => {
    createStatelessClient.mockReturnValue({
      from: () => ({
        select: async () => {
          throw new Error("network down");
        },
      }),
    });
    expect(await readInventory()).toBeNull();
  });
});
