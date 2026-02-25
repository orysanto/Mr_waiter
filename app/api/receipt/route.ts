// app/api/receipt/route.ts
// POST /api/receipt — sends a transactional email receipt for a completed order.
//
// Swap point: this file uses Resend. To switch to SendGrid:
//   1. `npm remove resend && npm install @sendgrid/mail`
//   2. Replace the `resend` block below with `sgMail.setApiKey(...)` + `sgMail.send(...)`
//   3. Everything else (validation, Supabase, logging) stays the same.
//
// Returns { ok: true } on success or { ok: false, error: string } on failure.

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createServerClient } from "@/lib/supabaseServer";

// ── Resend singleton ──────────────────────────────────────────────────────────
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = process.env.RECEIPT_FROM_EMAIL ?? "receipts@example.com";

// ── Types ─────────────────────────────────────────────────────────────────────
interface OrderItem {
  name:   string;
  qty:    number;
  price?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Very lightweight email format check. */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Build a simple HTML receipt email.
 * No external template engine — plain HTML string so there are zero extra deps.
 */
function buildEmail(params: {
  orderId:        string;
  restaurantName: string;
  address:        string;
  phone:          string;
  items:          OrderItem[];
  subtotal:       number | null;
  createdAt:      string;
}): { subject: string; html: string } {
  const { orderId, restaurantName, address, phone, items, subtotal, createdAt } = params;

  // Human-readable date
  const date = new Date(createdAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  // One table row per item
  const rows = items
    .map(item => {
      const lineTotal =
        item.price != null ? `$${(item.price * item.qty).toFixed(2)}` : "—";
      return `
        <tr>
          <td style="padding:6px 0;font-size:14px;color:#292524;">${item.name}</td>
          <td style="padding:6px 0;font-size:14px;color:#78716c;text-align:center;">× ${item.qty}</td>
          <td style="padding:6px 0;font-size:14px;color:#292524;text-align:right;">${lineTotal}</td>
        </tr>`;
    })
    .join("");

  // Subtotal row — omitted if null
  const subtotalRow =
    subtotal != null
      ? `<tr>
           <td colspan="2" style="padding-top:12px;font-size:14px;font-weight:700;
                                  color:#292524;border-top:1px dashed #e7e5e4;">Total</td>
           <td style="padding-top:12px;font-size:14px;font-weight:700;
                      color:#d97706;text-align:right;border-top:1px dashed #e7e5e4;">
             $${subtotal.toFixed(2)}
           </td>
         </tr>`
      : "";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Your receipt from ${restaurantName}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:ui-sans-serif,system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:16px;overflow:hidden;
                    box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:100%;">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#292524,#78350f);padding:28px 32px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#fff;">${restaurantName}</p>
          <p style="margin:6px 0 0;font-size:13px;color:#d6d3d1;">Order Receipt</p>
        </td></tr>

        <!-- Order meta -->
        <tr><td style="padding:20px 32px 16px;border-bottom:1px solid #e7e5e4;">
          <p style="margin:0;font-size:11px;text-transform:uppercase;
                    letter-spacing:.06em;color:#a8a29e;">Order ID</p>
          <p style="margin:4px 0 14px;font-size:15px;font-weight:700;
                    color:#292524;font-family:monospace;">
            #${orderId.slice(0, 8).toUpperCase()}
          </p>
          <p style="margin:0;font-size:11px;text-transform:uppercase;
                    letter-spacing:.06em;color:#a8a29e;">Date</p>
          <p style="margin:4px 0 0;font-size:13px;color:#57534e;">${date}</p>
        </td></tr>

        <!-- Items -->
        <tr><td style="padding:20px 32px;">
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;
                    text-transform:uppercase;letter-spacing:.06em;color:#a8a29e;">
            Items Ordered
          </p>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${rows}
            ${subtotalRow}
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#fafaf9;padding:20px 32px;border-top:1px solid #e7e5e4;">
          <p style="margin:0;font-size:11px;text-transform:uppercase;
                    letter-spacing:.06em;color:#a8a29e;">Questions?</p>
          <p style="margin:4px 0 2px;font-size:13px;color:#292524;">${phone}</p>
          <p style="margin:0;font-size:13px;color:#78716c;">${address}</p>
        </td></tr>

      </table>
      <p style="margin:20px 0 0;font-size:11px;color:#a8a29e;">
        This is a transactional receipt — you will not receive marketing emails.
      </p>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject: `Your receipt from ${restaurantName}`, html };
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { order_id?: string; email?: string };
    const { order_id, email } = body;

    // ── Validate inputs ───────────────────────────────────────────────────────
    if (!order_id?.trim()) {
      return NextResponse.json(
        { ok: false, error: "order_id is required" },
        { status: 400 },
      );
    }
    if (!email?.trim() || !isValidEmail(email)) {
      return NextResponse.json(
        { ok: false, error: "A valid email address is required" },
        { status: 400 },
      );
    }

    const supabase = createServerClient();

    // ── Fetch order ───────────────────────────────────────────────────────────
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, restaurant_id, items, subtotal, created_at")
      .eq("id", order_id.trim())
      .single();

    if (orderErr || !order) {
      return NextResponse.json(
        { ok: false, error: "Order not found. Please check the order ID." },
        { status: 404 },
      );
    }

    // ── Fetch restaurant ──────────────────────────────────────────────────────
    const { data: restaurant, error: restErr } = await supabase
      .from("restaurants")
      .select("name, address, phone")
      .eq("id", order.restaurant_id)
      .single();

    if (restErr || !restaurant) {
      return NextResponse.json(
        { ok: false, error: "Restaurant data not found." },
        { status: 404 },
      );
    }

    // ── Build + send email ────────────────────────────────────────────────────
    const { subject, html } = buildEmail({
      orderId:        order.id        as string,
      restaurantName: restaurant.name  as string,
      address:        restaurant.address as string,
      phone:          restaurant.phone   as string,
      items:          (order.items ?? []) as OrderItem[],
      subtotal:       typeof order.subtotal === "number" ? order.subtotal : null,
      createdAt:      order.created_at as string,
    });

    let providerMessageId: string | null = null;
    let sendStatus: "sent" | "failed"   = "failed";
    let sendError:  string | null        = null;

    try {
      const { data: sent, error: sendErr } = await resend.emails.send({
        from:    FROM,
        to:      [email.trim()],
        subject,
        html,
      });
      if (sendErr) throw new Error(sendErr.message);
      providerMessageId = sent?.id ?? null;
      sendStatus = "sent";
    } catch (e: unknown) {
      sendError = e instanceof Error ? e.message : "Email send failed";
      // Log the full Resend error so you can read it in the Next.js terminal
      console.error("[/api/receipt] Resend error — FROM:", FROM, "| Error:", sendError);
    }

    // ── Log attempt to receipts table (best-effort — never fails the request) ─
    const { error: logErr } = await supabase.from("receipts").insert({
      order_id:            order.id,
      email:               email.trim(),
      status:              sendStatus,
      provider_message_id: providerMessageId,
    });
    if (logErr) {
      // Non-fatal: the email was likely already sent; just warn in server logs
      console.warn("[/api/receipt] Failed to log to receipts table:", logErr.message);
    }

    // ── Respond ───────────────────────────────────────────────────────────────
    if (sendStatus === "failed") {
      // In development, surface the real Resend error so you can see exactly what's wrong.
      // In production this stays as a generic safe message.
      const isDev = process.env.NODE_ENV === "development";
      return NextResponse.json(
        {
          ok:    false,
          error: isDev && sendError
            ? `[Resend] ${sendError}`
            : "We couldn't send the email right now. Please try again later.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Receipt request failed";
    console.error("[/api/receipt] Unhandled error:", msg);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
