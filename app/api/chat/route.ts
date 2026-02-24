// app/api/chat/route.ts
// POST /api/chat — grounded AI chat using restaurant data as the only source of truth.
// Uses Anthropic (ANTHROPIC_API_KEY). Add OpenAI as a fallback if needed later.
// Returns { reply: string }.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabaseServer";

// Initialise Anthropic client once (reads ANTHROPIC_API_KEY from env automatically)
const anthropic = new Anthropic();

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const { restaurant_id, message, history = [] } = (await req.json()) as {
      restaurant_id: string;
      message: string;
      history?: ChatMessage[];
    };

    // ── Basic validation ──────────────────────────────────────────────────
    if (!restaurant_id || !message?.trim()) {
      return NextResponse.json(
        { error: "restaurant_id and message are required" },
        { status: 400 }
      );
    }

    // ── Fetch restaurant data from Supabase ───────────────────────────────
    const supabase = createServerClient();
    const { data: r, error } = await supabase
      .from("restaurants")
      .select("name, hours, address, phone, reservation_url, menu_text")
      .eq("id", restaurant_id)
      .single();

    if (error || !r) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    // ── Build strict grounding system prompt ──────────────────────────────
    // The AI is only allowed to answer from the data below — nothing invented.
    const systemPrompt = `You are Marco, the friendly AI waiter at ${r.name}.

STRICT RULES — follow them exactly:
1. Answer ONLY using the restaurant information provided below.
2. If a question cannot be answered from the information below, reply EXACTLY with: "I cannot confirm this. Please call ${r.phone}."
3. Never invent ingredients, allergen details, prices, hours, or policies.
4. For allergen or dietary questions: if the menu below does not explicitly confirm the item is safe, use rule 2.
5. Keep replies concise and friendly — this appears in a small chat widget.

RESTAURANT INFORMATION:
Name: ${r.name}
Hours: ${r.hours}
Address: ${r.address}
Phone: ${r.phone}
Reservations: ${r.reservation_url ?? "Not available online — please call."}

Menu:
${r.menu_text ?? "Menu details not available — please ask a staff member or call us."}`;

    // ── Build message list (last 6 turns for context window efficiency) ───
    const messages: ChatMessage[] = [
      ...history.slice(-6),
      { role: "user", content: message },
    ];

    // ── Call Anthropic ────────────────────────────────────────────────────
    try {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system: systemPrompt,
        messages,
      });

      const block = response.content[0];
      const reply = block.type === "text" ? block.text : "I'm unable to respond right now.";
      return NextResponse.json({ reply });

    } catch {
      // ── Fallback: canned replies from live DB data ──────────────────────
      // Triggered when Anthropic is unavailable (billing, network, etc.)
      const reply = cannedReply(message, r);
      return NextResponse.json({ reply });
    }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Chat request failed";
    console.error("POST /api/chat:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── Canned reply fallback (no API credits required) ───────────────────────────
function cannedReply(
  msg: string,
  r: { name: string; hours: string; address: string; phone: string; reservation_url: string | null; menu_text: string | null }
): string {
  const m = msg.toLowerCase();

  if (/hi|hello|hey|good (morning|evening|afternoon)|howdy/.test(m))
    return `Welcome to ${r.name}! 👋 I'm Marco, your AI waiter. I can tell you about our hours, location, menu, or help you place an order. What can I get for you?`;

  if (/hour|open|close|when|time/.test(m))
    return `We're open ${r.hours}. We'd love to see you! 🕐`;

  if (/locat|address|where|direction|find/.test(m))
    return `You can find us at ${r.address}. See you soon! 📍`;

  if (/phone|call|number|contact/.test(m))
    return `You can reach us at ${r.phone}. We're happy to help! 📞`;

  if (/reserv|book|table/.test(m))
    return r.reservation_url
      ? `Reserve a table here: ${r.reservation_url} 🗓️`
      : `Please call us at ${r.phone} to make a reservation.`;

  if (/menu|dish|eat|food|order|recommend|special/.test(m))
    return r.menu_text
      ? `Here's what we're serving:\n\n${r.menu_text}`
      : `Please tap 🛒 Start Order to browse our current menu, or call us at ${r.phone} for today's specials.`;

  return `I cannot confirm this right now. Please call us at ${r.phone} and a staff member will be happy to help!`;
}
