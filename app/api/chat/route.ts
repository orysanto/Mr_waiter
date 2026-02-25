// app/api/chat/route.ts
// POST /api/chat — grounded AI chat using Anthropic Messages API.
// Marco behaves like a real waiter: asks ONE clarifying question when vague,
// then recommends 2–4 real menu items. Never invents data.
// Returns { reply: string, actions?: CartAction[] }.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabaseServer";

// Module-level singleton — reads ANTHROPIC_API_KEY from env automatically
const anthropic = new Anthropic();

// ── Types ─────────────────────────────────────────────────────────────────────
interface RawMessage {
  role:    "user" | "assistant";
  content: string;
  [key: string]:  unknown; // widget may attach extra fields like `ts`; we strip them below
}

// Cart actions the model can request; the client validates and applies them.
// The model never mutates state directly — it only suggests actions.
type CartAction =
  | { type: "ADD_TO_CART";    itemName: string; qty: number }
  | { type: "REMOVE_FROM_CART"; itemName: string; qty: number }
  | { type: "CLEAR_CART" };

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract and validate <cart_actions>…</cart_actions> from a model reply.
 * Returns the cleaned reply text (tag stripped) + a validated action array.
 * Any malformed JSON or invalid action shapes are silently dropped.
 */
function extractActions(text: string): { clean: string; actions: CartAction[] } {
  const match = text.match(/<cart_actions>([\s\S]*?)<\/cart_actions>/);
  if (!match) return { clean: text, actions: [] };

  // Strip the XML tag so users never see raw JSON in the chat bubble
  const clean = text.replace(/<cart_actions>[\s\S]*?<\/cart_actions>/, "").trim();

  try {
    const parsed = JSON.parse(match[1].trim()) as { actions?: unknown[] };
    const raw = Array.isArray(parsed.actions) ? parsed.actions : [];

    // Validate each action; drop anything that doesn't match the schema
    const actions: CartAction[] = raw.flatMap((a): CartAction[] => {
      if (typeof a !== "object" || a === null) return [];
      const act = a as Record<string, unknown>;

      if (
        (act.type === "ADD_TO_CART" || act.type === "REMOVE_FROM_CART") &&
        typeof act.itemName === "string" && act.itemName.trim() &&
        typeof act.qty    === "number"  && Number.isInteger(act.qty) && act.qty >= 1
      ) {
        return [{ type: act.type, itemName: act.itemName.trim(), qty: act.qty }];
      }
      if (act.type === "CLEAR_CART") return [{ type: "CLEAR_CART" }];
      return [];
    });

    return { clean, actions };
  } catch {
    // Malformed JSON — ignore actions, return cleaned text as-is
    return { clean, actions: [] };
  }
}

/**
 * Serialise menu_items JSONB → numbered list for the system prompt.
 * Falls back to menu_text if menu_items is empty.
 */
function buildMenuBlock(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  menuItems: any[] | null | undefined,
  menuText:  string | null | undefined,
): string {
  const items = Array.isArray(menuItems) ? menuItems : [];

  if (items.length > 0) {
    return items.map((item, i) => {
      const name  = String(item?.name        ?? "Item").trim();
      const desc  = String(item?.description ?? "").trim();
      const price = typeof item?.price === "number"
        ? `$${(item.price as number).toFixed(2)}` : null;

      const parts = [`${i + 1}. ${name}`];
      if (price) parts.push(`(${price})`);
      if (desc)  parts.push(`- ${desc}`);
      return parts.join(" ");
    }).join("\n");
  }

  return menuText?.trim() ?? "Menu details not available — please ask a staff member.";
}

/**
 * Serialise a JSONB column (array or plain object) to a human-readable string
 * for injection into the system prompt.
 *   - Array of { q, a }                → Q&A list
 *   - Array of { title, price?, description? } → specials bullet list
 *   - Plain object                     → "Label: value" pairs
 *   - String                           → returned as-is
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialiseJsonb(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();

  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    return value.map((item) => {
      if (typeof item !== "object" || item === null) return String(item);
      if ("q" in item && "a" in item)
        return `Q: ${item.q}\nA: ${item.a}`;
      if ("title" in item) {
        const price = typeof item.price === "number" ? ` ($${(item.price as number).toFixed(2)})` : "";
        const desc  = item.description ? ` — ${item.description}` : "";
        return `- ${item.title}${price}${desc}`;
      }
      return JSON.stringify(item);
    }).join("\n\n");
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}: ${v}`)
      .join("\n");
  }

  return String(value);
}

/**
 * Sanitise history coming from the client:
 *   - Strip unknown fields (e.g. `ts`) so Anthropic SDK never sees them.
 *   - Drop leading assistant messages — Anthropic requires the first turn to be "user".
 *   - Keep the last N turns for context.
 */
function sanitiseHistory(
  raw: RawMessage[],
  maxTurns = 10,
): Anthropic.MessageParam[] {
  const clean: Anthropic.MessageParam[] = raw
    .slice(-maxTurns)
    .map(m => ({ role: m.role, content: String(m.content) }));

  // Anthropic: first message in array must be from "user"
  while (clean.length > 0 && clean[0].role === "assistant") {
    clean.shift();
  }

  return clean;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { restaurant_id, message, history = [], pastOrderContext } = (await req.json()) as {
      restaurant_id:      string;
      message:            string;
      history?:           RawMessage[];
      pastOrderContext?:  string; // "Customer previously ordered: X, Y, Z."
    };

    if (!restaurant_id || !message?.trim()) {
      return NextResponse.json(
        { error: "restaurant_id and message are required" },
        { status: 400 },
      );
    }

    // ── Fetch restaurant row (menu_items for structured data, menu_text fallback) ──
    const supabase = createServerClient();
    const { data: r, error } = await supabase
      .from("restaurants")
      .select("name, hours, address, phone, reservation_url, menu_items, menu_text, faqs, policies, specials, service_info")
      .eq("id", restaurant_id)
      .single();

    if (error || !r) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const menuBlock = buildMenuBlock(r.menu_items as any, r.menu_text);

    // ── System prompt ─────────────────────────────────────────────────────────
    // Written for Claude Haiku: short, direct, WHEN→DO structure, XML-delimited.
    // XML tags are important — Claude models are trained to follow them reliably.
    const systemPrompt = `\
You are Marco, the friendly AI waiter at ${r.name}.
Your job: help guests decide what to order and answer restaurant questions.
Keep every reply SHORT — this is a small chat widget. Max 3–5 sentences, or a tight list.

<behavior>

WHEN the guest asks for a recommendation, asks "what's good / popular / should I get",
or seems unsure what to order:
  IF you do NOT yet know their preference →
    Ask exactly ONE short clarifying question. Nothing else. No menu items yet. Examples:
      "Are you feeling something hearty like pasta, or something lighter?"
      "Any dietary preferences or a particular craving today?"
      "Thinking starters, a main, or the full works?"
  IF you DO know their preference (they just stated it, OR said it earlier in the chat) →
    Pick 2–4 items from MENU DATA below that best match. Format each as:
      [emoji] Name (price) — one sentence from its description explaining why it fits.
    Be selective. Do NOT list every item. Quality over quantity.

WHEN the guest clearly wants to add items ("add X", "I'll have X", "order X", "can I get X", "give me X") →
  Check MENU DATA below for each item.
  IF every item is found by exact name in MENU DATA:
    Confirm enthusiastically in 1–2 sentences.
    At the very END of your reply, append the <cart_actions> block (see format below). No text after it.
  IF any item is NOT found in MENU DATA or is ambiguous
  (e.g. user says "pizza" but menu has "Margherita Pizza" AND "Pepperoni Pizza"):
    Ask ONE clarifying question. Do NOT append <cart_actions>.

WHEN the guest asks about allergens, dietary safety, or specific ingredients →
  ONLY confirm if MENU DATA below EXPLICITLY states the dish is safe/free/contains X.
  Otherwise respond: "I can't confirm that — please call us at ${r.phone} so our kitchen can advise directly."

FOR EVERYTHING ELSE: answer only from RESTAURANT DATA below.
If the answer is not in the data, say: "I can't confirm that — please call ${r.phone}."
Never invent menu items, prices, ingredients, hours, or policies.

<cart_actions_format>
When adding items, append this JSON block at the very end of your reply — no text after it:
<cart_actions>{"actions":[{"type":"ADD_TO_CART","itemName":"EXACT_MENU_NAME","qty":1}]}</cart_actions>
Rules:
- "itemName" must match a name from MENU DATA exactly (same spelling, same capitalisation).
- "qty" must be a positive integer 1–10. Default to 1 if not stated.
- Multiple items → multiple objects in the "actions" array.
- Only output this block for clear add-to-cart intent. Never for questions or recommendations.
- If ANY item is ambiguous or missing from MENU DATA, omit the block entirely and ask a question.
</cart_actions_format>

</behavior>

<restaurant_data>
Restaurant: ${r.name}
Hours: ${r.hours}
Address: ${r.address}
Phone: ${r.phone}
Reservations: ${r.reservation_url ?? "Please call us to book a table."}

MENU:
${menuBlock}${serialiseJsonb(r.specials)     ? `\n\nTODAY'S SPECIALS:\n${serialiseJsonb(r.specials)}`         : ""}${serialiseJsonb(r.faqs)         ? `\n\nFREQUENTLY ASKED QUESTIONS:\n${serialiseJsonb(r.faqs)}`   : ""}${serialiseJsonb(r.policies)     ? `\n\nPOLICIES:\n${serialiseJsonb(r.policies)}`                   : ""}${serialiseJsonb(r.service_info) ? `\n\nSERVICE INFO:\n${serialiseJsonb(r.service_info)}`             : ""}
</restaurant_data>${pastOrderContext ? `

<customer_history>
${pastOrderContext}
When the guest asks for a recommendation, use this to personalise your suggestion — e.g. "Last time you enjoyed X; you might also like Y." Only reference items that exist in MENU DATA.
</customer_history>` : ""}`;

    // ── Build clean message list for Anthropic ────────────────────────────────
    const messages: Anthropic.MessageParam[] = [
      ...sanitiseHistory(history),
      { role: "user", content: message },
    ];

    // ── Call Anthropic ────────────────────────────────────────────────────────
    try {
      const response = await anthropic.messages.create({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system:     systemPrompt,
        messages,
      });

      const block = response.content[0];
      const raw   = block.type === "text"
        ? block.text
        : "Sorry, I'm unable to respond right now.";

      // Strip out any <cart_actions> block and parse it into structured actions.
      // The client will validate item names against its local menu before applying.
      const { clean: reply, actions } = extractActions(raw);

      return NextResponse.json({
        reply,
        ...(actions.length > 0 && { actions }),
      });

    } catch (anthropicErr: unknown) {
      // Log the real error so you can see it in the server terminal
      console.error("[/api/chat] Anthropic error:", anthropicErr);
      return NextResponse.json({ reply: cannedReply(message, r) });
    }

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Chat request failed";
    console.error("[/api/chat] Unhandled error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── Canned reply fallback ─────────────────────────────────────────────────────
// Only fires when the Anthropic API is completely unavailable.
// Covers the most common guest intents so the widget stays useful.
function cannedReply(
  msg: string,
  r: {
    name:            string;
    hours:           string;
    address:         string;
    phone:           string;
    reservation_url: string | null;
    menu_text:       string | null;
  },
): string {
  const m = msg.toLowerCase();

  if (/hi|hello|hey|good (morning|evening|afternoon)|howdy/.test(m))
    return `Welcome to ${r.name}! 👋 I'm Marco, your AI waiter. Ask me anything about our menu, hours, or location — or say "Start order" to browse!`;

  if (/hour|open|close|when|time/.test(m))
    return `We're open ${r.hours}. Hope to see you soon! 🕐`;

  if (/locat|address|where|direction/.test(m))
    return `You'll find us at ${r.address}. 📍`;

  if (/phone|call|number|contact/.test(m))
    return `Reach us at ${r.phone} — happy to help! 📞`;

  if (/reserv|book|table/.test(m))
    return r.reservation_url
      ? `Reserve a table here: ${r.reservation_url} 🗓️`
      : `Call us at ${r.phone} to make a reservation.`;

  if (/recommend|suggest|what.*good|what.*order|what.*popular|what.*eat/.test(m))
    return `Great question! To point you in the right direction — are you feeling something hearty like pasta, or something lighter? 😊`;

  if (/menu|food|dish|eat|order/.test(m))
    return r.menu_text
      ? `Here's what we're serving:\n\n${r.menu_text}`
      : `Tap 🛒 "Start order" to browse the menu, or call ${r.phone} for today's specials.`;

  return `I can't confirm that right now — please call us at ${r.phone} and a staff member will be glad to help!`;
}
