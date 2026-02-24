// app/api/admin/restaurant/route.ts
// GET  /api/admin/restaurant?id=<uuid>  — load the restaurant record (server-side, service role)
// POST /api/admin/restaurant            — update the restaurant record
//
// No authentication — demo only. Add auth middleware before any production use.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabaseServer";

// ── GET — fetch restaurant for the admin form ─────────────────────────────────
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query param is required" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Try with opentable_rid first; fall back without it if the column doesn't exist yet.
  let { data, error } = await supabase
    .from("restaurants")
    .select("id, name, address, hours, phone, reservation_url, opentable_rid, menu_items, menu_text")
    .eq("id", id)
    .single();

  if (error?.message?.includes("opentable_rid")) {
    ({ data, error } = await supabase
      .from("restaurants")
      .select("id, name, address, hours, phone, reservation_url, menu_items, menu_text")
      .eq("id", id)
      .single());
  }

  if (error || !data) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

// ── POST — save edits from the admin form ─────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, address, hours, phone, reservation_url, opentable_rid, menu_items, menu_text } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const supabase = createServerClient();
    // Only include opentable_rid if provided (column may not exist yet)
    const payload: Record<string, unknown> = {
      name, address, hours, phone, reservation_url, menu_items, menu_text,
    };
    if (opentable_rid !== undefined) payload.opentable_rid = opentable_rid;

    const { error } = await supabase
      .from("restaurants")
      .update(payload)
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Update failed";
    console.error("POST /api/admin/restaurant:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
