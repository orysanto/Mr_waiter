// app/api/order/route.ts
// POST /api/order — validates cart items and persists a new order to Supabase.
// Returns { order_id } on success or { error } on failure.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabaseServer";

interface OrderItem {
  name: string;
  qty: number;
  price?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { restaurant_id, items } = body as {
      restaurant_id: string;
      items: OrderItem[];
    };

    // ── Validate inputs ───────────────────────────────────────────────────
    if (!restaurant_id) {
      return NextResponse.json(
        { error: "restaurant_id is required" },
        { status: 400 }
      );
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "At least one item is required" },
        { status: 400 }
      );
    }
    for (const item of items) {
      if (!item.name?.trim()) {
        return NextResponse.json(
          { error: "Every item must have a name" },
          { status: 400 }
        );
      }
      if (typeof item.qty !== "number" || item.qty < 1) {
        return NextResponse.json(
          { error: `"${item.name}" has invalid qty — must be >= 1` },
          { status: 400 }
        );
      }
    }

    // ── Compute subtotal (only when every item has a price) ───────────────
    const allHavePrices = items.every(i => typeof i.price === "number");
    const subtotal = allHavePrices
      ? items.reduce((sum, i) => sum + (i.price! * i.qty), 0)
      : null;

    // ── Insert into Supabase orders table ─────────────────────────────────
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("orders")
      .insert({ restaurant_id, items, subtotal })
      .select("id")
      .single();

    if (error) throw error;

    return NextResponse.json({ order_id: data.id });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to place order";
    console.error("POST /api/order:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
