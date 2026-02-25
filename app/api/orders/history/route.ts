// app/api/orders/history/route.ts
// GET /api/orders/history?email=...&restaurant_id=...
// Returns the last 5 orders placed by this email at this restaurant.
// Lookup: receipts(email) → orders(id, items, created_at)
// No auth — email is the only key. Safe to expose: returns only aggregated item data.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabaseServer";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email         = searchParams.get("email")?.trim()         ?? "";
  const restaurant_id = searchParams.get("restaurant_id")?.trim() ?? "";

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: "Valid email is required" },
      { status: 400 },
    );
  }

  const supabase = createServerClient();

  // Step 1 — get order IDs linked to this email via the receipts log.
  // Fetch slightly more than 5 so we can still return 5 after the restaurant filter.
  const { data: receipts, error: recErr } = await supabase
    .from("receipts")
    .select("order_id")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(15);

  if (recErr) {
    console.error("[/api/orders/history] receipts query error:", recErr.message);
    return NextResponse.json({ orders: [] });
  }

  if (!receipts || receipts.length === 0) {
    return NextResponse.json({ orders: [] });
  }

  const orderIds = receipts.map(r => r.order_id).filter(Boolean) as string[];

  // Step 2 — fetch matching orders, optionally scoped to this restaurant.
  let ordersQuery = supabase
    .from("orders")
    .select("id, items, created_at, restaurant_id")
    .in("id", orderIds)
    .order("created_at", { ascending: false })
    .limit(5);

  if (restaurant_id) {
    ordersQuery = ordersQuery.eq("restaurant_id", restaurant_id);
  }

  const { data: orders, error: ordErr } = await ordersQuery;

  if (ordErr) {
    console.error("[/api/orders/history] orders query error:", ordErr.message);
    return NextResponse.json({ orders: [] });
  }

  return NextResponse.json({
    orders: (orders ?? []).map(o => ({
      order_id:   o.id,
      created_at: o.created_at,
      items:      Array.isArray(o.items) ? o.items : [],
    })),
  });
}
