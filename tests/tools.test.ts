// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  calculateCost,
  calculateCostInput,
  checkAvailability,
  getPrices,
  listProducts,
} from "@/lib/copper/assistant/tools";

describe("Ask Copper tools", () => {
  it("adds Copper Plus once for the household", () => {
    const one = calculateCost({
      products: ["copper-home"],
      plan: "copper-plus",
      billing: "annual",
      years: 2,
    });
    expect(one.totalUsd).toBe(307);
    const two = calculateCost({
      products: ["copper-home", "copper-home"],
      plan: "copper-plus",
      billing: "annual",
      years: 2,
    });
    expect(two.totalUsd).toBe(456);
  });

  it("bills monthly and skips the free plan line", () => {
    expect(
      calculateCost({
        products: [],
        plan: "copper-plus",
        billing: "monthly",
        years: 1,
      }).totalUsd,
    ).toBe(95.88);
    expect(
      calculateCost({
        products: ["copper-notes"],
        plan: "free",
        billing: "annual",
        years: 3,
      }).lines,
    ).toHaveLength(1);
  });

  it("rejects input outside the contract", () => {
    const ok = { products: [], plan: "free", billing: "annual", years: 1 };
    expect(calculateCostInput.safeParse(ok).success).toBe(true);
    for (const bad of [
      { ...ok, years: 0 },
      { ...ok, years: 1.5 },
      { ...ok, products: Array(6).fill("copper-home") },
      { ...ok, products: ["copper-toaster"] },
      { ...ok, extra: 1 },
    ]) {
      expect(calculateCostInput.safeParse(bad).success).toBe(false);
    }
  });

  it("lists products and prices from the catalog", () => {
    expect(listProducts().products[1].colors).toContain("Desert Sand");
    expect(getPrices().plans.map((p) => p.id)).toEqual(["free", "copper-plus"]);
  });

  it("reports stock levels and restock dates", async () => {
    const notes = await checkAvailability({
      product: "copper-notes",
      color: "night sky",
    });
    expect(notes).toEqual({
      status: "ok",
      product: "Copper Notes",
      colors: [
        { color: "Night Sky", stock: "backordered", restockDate: "2026-11-14" },
      ],
    });
    const home = await checkAvailability({ product: "copper-home" });
    expect(home.status === "ok" && home.colors.map((c) => c.stock)).toEqual([
      "in_stock",
      "low_stock",
      "in_stock",
    ]);
  });

  it("says Patina Teal isn't a Copper Notes color", async () => {
    const r = await checkAvailability({
      product: "copper-notes",
      color: "Patina Teal",
    });
    expect(r.status).toBe("not_a_color");
  });
});
