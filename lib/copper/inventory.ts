// How many of each product color are on the shelf, and when the next shipment
// lands (Product Bible Section 10). Stock changes, so check_availability reads
// it fresh every time instead of remembering it.
// This is the only file that knows where stock is kept, so swapping the
// Supabase table for something else later means changing only readInventory().
import { createStatelessClient } from "@/lib/supabase/server";

/** One row of stock, named like the database columns it will come from. */
export type InventoryRow = {
  sku: string;
  product: string;
  color: string;
  units_in_stock: number;
  next_shipment: string;
};

/**
 * Every row of the Supabase `inventory` table, or `null` when stock can't be
 * read right now (Supabase isn't set up, the request failed, or it threw).
 */
export async function readInventory(): Promise<InventoryRow[] | null> {
  const supabase = createStatelessClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.from("inventory").select("*");
    if (error || !data) return null;
    return data as InventoryRow[];
  } catch {
    return null;
  }
}
