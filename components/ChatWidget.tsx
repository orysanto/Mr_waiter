"use client";
// components/ChatWidget.tsx
// Floating chat widget — mounts on every page via app/layout.tsx.
// ALL business logic is preserved from the original implementation.
// Modes: 'chat' | 'order' | 'confirmation' | 'compare' | 'reserve'

import { useState, useRef, useEffect, useCallback } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

// ── Types ──────────────────────────────────────────────────────────────────────
type MenuItem  = { id: number; name: string; description: string; price: number };
type Message   = { role: "user" | "assistant"; content: string; ts?: string };
type Mode      = "chat" | "order" | "confirmation" | "compare" | "reserve";

type Restaurant = {
  id:              string;
  name:            string;
  hours:           string;
  address:         string;
  phone:           string;
  reservation_url: string | null;
  opentable_rid:   string | null;
  menu_items:      MenuItem[];
};

// ── Inline waiter avatar SVG (Italian waiter: white shirt, black vest, bow tie) ─
function WaiterAvatar({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Marco the AI Waiter"
    >
      <circle cx="50" cy="50" r="50" fill="#FEF3C7"/>
      {/* Body */}
      <path d="M16 100 Q16 72 36 67 L50 75 L64 67 Q84 72 84 100 Z" fill="white"/>
      <path d="M36 67 L50 75 L64 67 Q67 82 64 90 L50 87 L36 90 Q33 82 36 67 Z" fill="#111827"/>
      <path d="M46 67 L50 75 L50 87 L44 87 Q36 80 36 67 Z" fill="#111827"/>
      <path d="M54 67 L50 75 L50 87 L56 87 Q64 80 64 67 Z" fill="#111827"/>
      {/* Bow tie */}
      <path d="M43 64 L50 67 L57 64 L50 61 Z" fill="#B91C1C"/>
      <circle cx="50" cy="64" r="2.2" fill="#7F1D1D"/>
      {/* Neck */}
      <rect x="45" y="57" width="10" height="12" rx="5" fill="#FBBF88"/>
      {/* Head */}
      <circle cx="50" cy="37" r="21" fill="#FBBF88"/>
      <ellipse cx="29" cy="38" rx="3.5" ry="4.5" fill="#F5A264"/>
      <ellipse cx="71" cy="38" rx="3.5" ry="4.5" fill="#F5A264"/>
      {/* Hair */}
      <path d="M30 32 Q31 14 50 12 Q69 14 70 32 Q66 19 50 18 Q34 19 30 32 Z" fill="#1C1917"/>
      <path d="M30 32 Q28 38 29 44 Q28 37 30 32 Z" fill="#1C1917"/>
      <path d="M70 32 Q72 38 71 44 Q72 37 70 32 Z" fill="#1C1917"/>
      {/* Eyes */}
      <ellipse cx="42" cy="36" rx="4.5" ry="5" fill="white"/>
      <ellipse cx="58" cy="36" rx="4.5" ry="5" fill="white"/>
      <circle  cx="43" cy="37" r="3"    fill="#1C1917"/>
      <circle  cx="59" cy="37" r="3"    fill="#1C1917"/>
      <circle  cx="44" cy="36" r="1.1"  fill="white"/>
      <circle  cx="60" cy="36" r="1.1"  fill="white"/>
      {/* Eyebrows */}
      <path d="M38 29 Q42 26 46 29" stroke="#1C1917" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
      <path d="M54 29 Q58 26 62 29" stroke="#1C1917" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
      {/* Nose */}
      <ellipse cx="50" cy="42" rx="2" ry="1.8" fill="#E8906A"/>
      {/* Mustache */}
      <path d="M43 46 Q46 43 50 46 Q54 43 57 46" stroke="#1C1917" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      {/* Smile */}
      <path d="M43 50 Q50 56 57 50" stroke="#C07A60" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

// ── Tiny helpers ───────────────────────────────────────────────────────────────
function nowTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderText(content: string) {
  return content.split("\n").map((line, i, arr) => (
    <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
  ));
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function ChatWidget() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [restaurant,    setRestaurant]    = useState<Restaurant | null>(null);
  const [loadError,     setLoadError]     = useState(false);

  const [isOpen,        setIsOpen]        = useState(false);
  const [mode,          setMode]          = useState<Mode>("chat");
  const [messages,      setMessages]      = useState<Message[]>([]);
  const [input,         setInput]         = useState("");
  const [isTyping,      setIsTyping]      = useState(false);

  // Order
  const [quantities,    setQuantities]    = useState<Record<number, number>>({});
  const [adjustments,   setAdjustments]   = useState<Record<number, string>>({});
  const [adjustingItem, setAdjustingItem] = useState<number | null>(null);
  const [adjustInput,   setAdjustInput]   = useState("");
  const [orderId,       setOrderId]       = useState("");
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Compare
  const [compareSelections, setCompareSelections] = useState<number[]>([]);

  // Reserve
  const [reserveParty, setReserveParty] = useState(2);
  const [reserveDate,  setReserveDate]  = useState("");
  const [reserveTime,  setReserveTime]  = useState("19:00");

  const bottomRef = useRef<HTMLDivElement>(null);
  const modalRef  = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // ── Listen for custom "open-chat" event (from OpenChatButton / page CTAs) ──
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ mode?: Mode }>).detail;
      setIsOpen(true);
      if (detail?.mode && detail.mode !== mode) setMode(detail.mode);
    };
    window.addEventListener("open-chat", handler);
    return () => window.removeEventListener("open-chat", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── ESC closes the widget ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen]);

  // ── Basic focus trap inside the modal ───────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !modalRef.current) return;
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, [isOpen]);

  // Focus the input when chat opens
  useEffect(() => {
    if (isOpen && mode === "chat") {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen, mode]);

  // ── Load restaurant + menu from Supabase on mount ───────────────────────────
  useEffect(() => {
    const id = process.env.NEXT_PUBLIC_RESTAURANT_ID;
    if (!id) { setLoadError(true); return; }

    getSupabaseBrowser()
      .from("restaurants")
      .select("id, name, hours, address, phone, reservation_url, opentable_rid, menu_items")
      .eq("id", id)
      .single()
      .then(({ data, error }: { data: Record<string, unknown> | null; error: unknown }) => {
        if (error || !data) { setLoadError(true); return; }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawItems = (data.menu_items ?? []) as any[];
        const menu: MenuItem[] = rawItems.map((item, idx) => ({
          id:          typeof item?.id    === "number" ? item.id    : idx + 1,
          name:        String(item?.name        ?? ""),
          description: String(item?.description ?? ""),
          price:       typeof item?.price === "number" ? item.price : 0,
        }));

        setRestaurant({
          id:              String(data.id              ?? ""),
          name:            String(data.name            ?? ""),
          hours:           String(data.hours           ?? ""),
          address:         String(data.address         ?? ""),
          phone:           String(data.phone           ?? ""),
          reservation_url: data.reservation_url != null && String(data.reservation_url).trim() !== ""
                             ? String(data.reservation_url) : null,
          opentable_rid:   data.opentable_rid   != null && String(data.opentable_rid).trim()   !== ""
                             ? String(data.opentable_rid)   : null,
          menu_items: menu,
        });

        setMessages([{
          role:    "assistant",
          content: `Welcome to ${data.name}! I'm Marco, your personal AI waiter. 👋\n\nAsk me about our menu, hours, or location — or tap an action below!`,
          ts:      nowTime(),
        }]);
      });
  }, []);

  const menu: MenuItem[] = restaurant?.menu_items ?? [];

  // ── Send message ─────────────────────────────────────────────────────────────
  const send = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setMessages(prev => [...prev, { role: "user", content: text, ts: nowTime() }]);
    setInput("");
    setIsTyping(true);

    const q = text.toLowerCase();

    if (/start order|place order|i want to order/i.test(q)) {
      setIsTyping(false);
      setMode("order");
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Great choice! Browse our menu below.\n\nTap + to add items, ✏️ for special requests, then Checkout when ready. 🛒",
        ts: nowTime(),
      }]);
      return;
    }

    if (/\bcompare\b|versus|\bvs\b/.test(q)) {
      setIsTyping(false);
      setCompareSelections([]);
      setMode("compare");
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Sure! Select any two dishes and I'll compare them side by side. 🍽️",
        ts: nowTime(),
      }]);
      return;
    }

    if (/reserv|book.*table|table.*for|📅/i.test(q)) {
      setIsTyping(false);
      setMode("reserve");
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Let's get you a table! 📅 Pick your party size, date, and time below.",
        ts: nowTime(),
      }]);
      return;
    }

    if (!restaurant?.id) {
      setIsTyping(false);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Still loading restaurant data — please try again in a moment!",
        ts: nowTime(),
      }]);
      return;
    }

    try {
      const res  = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          message:       text,
          history:       messages.slice(-6),
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        role:    "assistant",
        content: data.reply ?? data.error ?? "Sorry, I had trouble with that. Please try again.",
        ts:      nowTime(),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role:    "assistant",
        content: "I'm having trouble connecting right now. Please try again! 😊",
        ts:      nowTime(),
      }]);
    } finally {
      setIsTyping(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant, messages]);

  // ── Order helpers ─────────────────────────────────────────────────────────────
  const adjustQty = (id: number, delta: number) =>
    setQuantities(prev => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) + delta) }));

  const saveAdjustment = (id: number) => {
    if (adjustInput.trim()) {
      setAdjustments(prev => ({ ...prev, [id]: adjustInput.trim() }));
    } else {
      setAdjustments(prev => { const n = { ...prev }; delete n[id]; return n; });
    }
    setAdjustingItem(null);
    setAdjustInput("");
  };

  const cartItems = menu.filter(item => (quantities[item.id] ?? 0) > 0);
  const cartTotal = cartItems.reduce((sum, item) => sum + item.price * (quantities[item.id] ?? 0), 0);

  // ── Checkout ──────────────────────────────────────────────────────────────────
  const checkout = async () => {
    if (!restaurant?.id || cartItems.length === 0) return;
    setIsCheckingOut(true);
    try {
      const res  = await fetch("/api/order", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          items: cartItems.map(item => ({
            name:  item.name,
            qty:   quantities[item.id] ?? 0,
            price: item.price,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      setOrderId(data.order_id);
      setMode("confirmation");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Checkout failed";
      setMessages(prev => [...prev, { role: "assistant", content: `⚠️ ${msg} — please try again.`, ts: nowTime() }]);
      setMode("chat");
    } finally {
      setIsCheckingOut(false);
    }
  };

  const resetAll = () => {
    setQuantities({});
    setAdjustments({});
    setAdjustingItem(null);
    setAdjustInput("");
    setOrderId("");
    setCompareSelections([]);
    setMode("order");
  };

  // ── Compare helpers ───────────────────────────────────────────────────────────
  const toggleCompare = (id: number) => {
    setCompareSelections(prev => {
      if (prev.includes(id))  return prev.filter(x => x !== id);
      if (prev.length >= 2)   return [prev[1], id];
      return [...prev, id];
    });
  };
  const compareItems = compareSelections
    .map(id => menu.find(m => m.id === id))
    .filter((m): m is MenuItem => !!m);

  // ── Quick actions (shown at top of chat mode) ─────────────────────────────────
  const QUICK_ACTIONS = [
    { icon: "🕐", label: "Hours"       },
    { icon: "📍", label: "Location"    },
    { icon: "🍽️", label: "Menu"        },
    { icon: "📅", label: "Reserve"     },
    { icon: "🛒", label: "Start order" },
    { icon: "💡", label: "Recommend"   },
    { icon: "⚖️", label: "Compare"     },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Floating trigger button ────────────────────────────────────────── */}
      <button
        id="chat-open-btn"
        onClick={() => setIsOpen(o => !o)}
        aria-label={isOpen ? "Close AI Waiter chat" : "Open AI Waiter chat"}
        className={`
          fixed bottom-6 right-6 z-50
          w-16 h-16 rounded-full
          shadow-2xl shadow-amber-900/40
          flex items-center justify-center
          border-2 border-amber-400/40
          transition-all duration-200 hover:scale-110 active:scale-95
          overflow-hidden
          ${isOpen
            ? "bg-stone-800 hover:bg-stone-700"
            : "bg-gradient-to-br from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600"
          }
        `}
      >
        {isOpen ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
               xmlns="http://www.w3.org/2000/svg" className="text-white" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        ) : (
          <WaiterAvatar size={54} />
        )}
      </button>

      {/* ── Chat modal ─────────────────────────────────────────────────────── */}
      {isOpen && (
        <div
          ref={modalRef}
          role="dialog"
          aria-label="AI Waiter chat"
          aria-modal="true"
          className="
            fixed bottom-[88px] right-5 z-50
            w-[94vw] sm:w-[460px]
            h-[82vh]  max-h-[680px]
            bg-white rounded-2xl
            shadow-[0_8px_40px_-4px_rgba(0,0,0,0.25)]
            flex flex-col overflow-hidden
            border border-stone-200/60
            animate-widget-open
          "
        >
          {/* ── Header ───────────────────────────────────────────────────── */}
          <div className="bg-gradient-to-r from-stone-900 via-amber-950 to-stone-900
                          text-white px-4 py-3 flex items-center gap-3 shrink-0">
            {/* Avatar with online indicator */}
            <div className="relative shrink-0">
              <div className="rounded-full overflow-hidden border-2 border-amber-500/40 bg-amber-100">
                <WaiterAvatar size={46} />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-400
                               rounded-full border-2 border-stone-900" />
            </div>

            {/* Name + status */}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm leading-tight truncate">
                {restaurant?.name ?? "Loading…"}
              </p>
              <p className="text-stone-400 text-[11px] mt-0.5">Marco · AI Waiter</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                <span className="text-[10px] text-green-400 font-medium">Online · 24/7</span>
              </div>
            </div>

            {/* Reserve button (persistent in header) */}
            {restaurant?.reservation_url && (
              <a
                href={restaurant.reservation_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-semibold bg-amber-600 hover:bg-amber-500
                           text-white px-3 py-1.5 rounded-full shrink-0 transition-colors"
              >
                Reserve
              </a>
            )}

            {/* Back-to-chat (non-chat modes) */}
            {mode !== "chat" && (
              <button
                onClick={() => setMode("chat")}
                className="text-[11px] text-stone-300 hover:text-white
                           bg-white/10 hover:bg-white/20 px-2.5 py-1.5
                           rounded-full shrink-0 transition-colors"
              >
                ← Chat
              </button>
            )}

            {/* Close button */}
            <button
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
              className="text-stone-400 hover:text-white p-1 shrink-0 transition-colors rounded-full
                         hover:bg-white/10"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Error banner */}
          {loadError && (
            <div className="bg-red-50 border-b border-red-100 px-4 py-2.5 shrink-0">
              <p className="text-red-500 text-xs text-center font-medium">
                Unable to load restaurant data — please refresh the page.
              </p>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              CHAT MODE
          ══════════════════════════════════════════════════════════════ */}
          {mode === "chat" && (
            <>
              {/* Quick Actions bar */}
              <div className="px-3 py-2.5 flex gap-2 overflow-x-auto no-scrollbar
                              border-b border-stone-100 bg-stone-50/80 shrink-0">
                {QUICK_ACTIONS.map(a => (
                  <button
                    key={a.label}
                    onClick={() => send(a.label)}
                    className="flex items-center gap-1.5 shrink-0 text-[11px] font-semibold
                               bg-white hover:bg-amber-50 text-stone-600 hover:text-amber-700
                               border border-stone-200 hover:border-amber-300
                               rounded-xl px-2.5 py-1.5 transition-colors whitespace-nowrap
                               shadow-sm"
                  >
                    <span>{a.icon}</span>
                    <span>{a.label}</span>
                  </button>
                ))}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-stone-50">

                {/* Loading skeleton */}
                {!restaurant && !loadError && (
                  <div className="flex items-center justify-center h-32">
                    <div className="flex gap-1.5">
                      <span className="typing-dot w-2 h-2 bg-amber-400 rounded-full" />
                      <span className="typing-dot w-2 h-2 bg-amber-400 rounded-full" />
                      <span className="typing-dot w-2 h-2 bg-amber-400 rounded-full" />
                    </div>
                  </div>
                )}

                {/* Graceful error */}
                {!restaurant && loadError && (
                  <div className="text-center py-8">
                    <p className="text-4xl mb-3">😔</p>
                    <p className="text-stone-500 text-sm font-medium">
                      Couldn&apos;t load restaurant info.
                    </p>
                    <p className="text-stone-400 text-xs mt-1">
                      Please refresh the page to try again.
                    </p>
                  </div>
                )}

                {/* Message bubbles */}
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex items-end gap-2 ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {msg.role === "assistant" && (
                      <div className="rounded-full overflow-hidden shrink-0
                                      bg-amber-50 border border-amber-200 self-end shadow-sm">
                        <WaiterAvatar size={32} />
                      </div>
                    )}
                    <div className="max-w-[78%] flex flex-col gap-1">
                      <div
                        className={`
                          rounded-2xl px-4 py-2.5 text-sm leading-relaxed
                          ${msg.role === "user"
                            ? "bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-br-sm shadow-sm"
                            : "bg-white text-stone-800 rounded-bl-sm shadow-sm border border-stone-100"
                          }
                        `}
                      >
                        {renderText(msg.content)}
                      </div>
                      {msg.ts && (
                        <p className={`text-[10px] text-stone-400 ${
                          msg.role === "user" ? "text-right" : "text-left"
                        }`}>
                          {msg.ts}
                        </p>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-7 h-7 rounded-full bg-stone-200 flex items-center justify-center
                                      shrink-0 text-xs font-bold text-stone-500 self-end">
                        You
                      </div>
                    )}
                  </div>
                ))}

                {/* Typing indicator */}
                {isTyping && (
                  <div className="flex items-end gap-2 justify-start">
                    <div className="rounded-full overflow-hidden shrink-0 bg-amber-50 border border-amber-200">
                      <WaiterAvatar size={32} />
                    </div>
                    <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3
                                    flex gap-1.5 items-center shadow-sm border border-stone-100">
                      <span className="typing-dot w-2 h-2 bg-amber-400 rounded-full" />
                      <span className="typing-dot w-2 h-2 bg-amber-400 rounded-full" />
                      <span className="typing-dot w-2 h-2 bg-amber-400 rounded-full" />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Text input — textarea supports Shift+Enter for newline */}
              <div className="px-3 py-3 border-t border-stone-100 flex gap-2 items-end bg-white shrink-0">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (input.trim() && !isTyping) send(input);
                    }
                  }}
                  placeholder="Ask Marco anything… (Shift+Enter for new line)"
                  rows={1}
                  className="flex-1 resize-none border border-stone-200 bg-stone-50 rounded-2xl
                             px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400
                             max-h-28 overflow-y-auto leading-relaxed placeholder:text-stone-400"
                  style={{ minHeight: "42px" }}
                />
                <button
                  onClick={() => { if (input.trim() && !isTyping) send(input); }}
                  disabled={!input.trim() || isTyping}
                  aria-label="Send message"
                  className="bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white
                             rounded-full w-10 h-10 flex items-center justify-center shrink-0
                             transition-all active:scale-95 shadow-sm self-end"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                       xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>

              {/* Powered by AI footer */}
              <div className="text-center py-1.5 bg-stone-50 border-t border-stone-100 shrink-0">
                <p className="text-[10px] text-stone-400 tracking-wide">
                  Powered by AI · Marco is here 24/7
                </p>
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ORDER MODE
          ══════════════════════════════════════════════════════════════ */}
          {mode === "order" && (
            <div className="flex-1 flex flex-col bg-stone-50 min-h-0">
              <div className="px-4 py-3 bg-white border-b border-stone-100 shrink-0">
                <p className="text-xs font-bold text-stone-500 uppercase tracking-widest">
                  Our Menu
                </p>
              </div>

              {/* Menu items */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {menu.length === 0 && !loadError && (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <div className="flex gap-1.5 justify-center mb-3">
                        <span className="typing-dot w-2 h-2 bg-amber-400 rounded-full" />
                        <span className="typing-dot w-2 h-2 bg-amber-400 rounded-full" />
                        <span className="typing-dot w-2 h-2 bg-amber-400 rounded-full" />
                      </div>
                      <p className="text-stone-400 text-sm">Loading menu…</p>
                    </div>
                  </div>
                )}
                {menu.length === 0 && loadError && (
                  <div className="text-center py-12">
                    <p className="text-4xl mb-2">😔</p>
                    <p className="text-stone-500 text-sm">Unable to load menu.</p>
                  </div>
                )}

                {menu.map(item => (
                  <div
                    key={item.id}
                    className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden
                               hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-3 p-4">
                      <div className="w-14 h-14 rounded-xl bg-amber-50 border border-amber-100
                                      flex items-center justify-center text-2xl shrink-0">
                        🍽️
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-stone-800 text-sm">{item.name}</p>
                        <p className="text-stone-400 text-xs mt-0.5 leading-relaxed line-clamp-2">
                          {item.description}
                        </p>
                        <p className="text-amber-600 font-bold text-sm mt-1.5">
                          {item.price > 0 ? `$${item.price.toFixed(2)}` : "—"}
                        </p>
                      </div>
                      {/* Stepper */}
                      <div className="flex items-center gap-1.5 shrink-0 mt-1">
                        <button
                          onClick={() => adjustQty(item.id, -1)}
                          disabled={(quantities[item.id] ?? 0) === 0}
                          className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200
                                     disabled:opacity-25 flex items-center justify-center
                                     text-lg font-bold text-stone-700 transition-colors"
                          aria-label={`Remove ${item.name}`}
                        >−</button>
                        <span className="w-6 text-center text-sm font-bold tabular-nums text-stone-800">
                          {quantities[item.id] ?? 0}
                        </span>
                        <button
                          onClick={() => adjustQty(item.id, 1)}
                          className="w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-600
                                     flex items-center justify-center text-lg font-bold
                                     text-white transition-colors shadow-sm"
                          aria-label={`Add ${item.name}`}
                        >+</button>
                      </div>
                    </div>

                    {/* Special request (visible once in cart) */}
                    {(quantities[item.id] ?? 0) > 0 && (
                      <div className="border-t border-stone-50 bg-amber-50/60 px-4 py-2.5">
                        {adjustingItem === item.id ? (
                          <div className="flex gap-2">
                            <input
                              autoFocus
                              value={adjustInput}
                              onChange={e => setAdjustInput(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") saveAdjustment(item.id); }}
                              placeholder="e.g. no onions, well done, nut allergy…"
                              className="flex-1 text-xs border border-amber-200 rounded-full px-3 py-1.5
                                         focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
                            />
                            <button
                              onClick={() => saveAdjustment(item.id)}
                              className="text-xs bg-amber-600 hover:bg-amber-700 text-white
                                         rounded-full px-3 py-1.5 shrink-0 transition-colors font-semibold"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setAdjustingItem(item.id);
                              setAdjustInput(adjustments[item.id] ?? "");
                            }}
                            className="text-xs text-amber-700 hover:text-amber-900
                                       flex items-center gap-1.5 transition-colors"
                          >
                            ✏️{" "}
                            {adjustments[item.id]
                              ? <span>Note: <em className="font-medium">&ldquo;{adjustments[item.id]}&rdquo;</em></span>
                              : <span className="font-medium">Add special request</span>
                            }
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Sticky cart summary */}
              {cartItems.length > 0 && (
                <div className="border-t border-stone-200 bg-white px-4 py-4 shrink-0 shadow-[0_-4px_16px_-4px_rgba(0,0,0,0.08)]">
                  <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-2.5">
                    Your Cart
                  </p>
                  <div className="space-y-1.5 mb-3">
                    {cartItems.map(item => (
                      <div key={item.id}>
                        <div className="flex justify-between text-sm text-stone-700">
                          <span className="font-medium">{item.name}
                            <span className="text-stone-400 font-normal"> × {quantities[item.id]}</span>
                          </span>
                          <span className="font-semibold">
                            ${(item.price * (quantities[item.id] ?? 0)).toFixed(2)}
                          </span>
                        </div>
                        {adjustments[item.id] && (
                          <p className="text-[11px] text-amber-600 italic ml-2 mt-0.5">
                            ↳ {adjustments[item.id]}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between font-bold text-stone-900
                                  pt-2.5 border-t border-dashed border-stone-200 text-sm">
                    <span>Subtotal</span>
                    <span className="text-amber-600 text-base">${cartTotal.toFixed(2)}</span>
                  </div>
                  <button
                    onClick={checkout}
                    disabled={isCheckingOut}
                    className="mt-3 w-full bg-gradient-to-r from-amber-600 to-amber-500
                               hover:from-amber-700 hover:to-amber-600
                               disabled:opacity-60 text-white font-bold
                               py-3 rounded-full text-sm transition-all active:scale-95 shadow-md"
                  >
                    {isCheckingOut ? "Placing order…" : "Checkout →"}
                  </button>
                </div>
              )}

              {/* Footer */}
              <div className="text-center py-1.5 bg-white border-t border-stone-50 shrink-0">
                <p className="text-[10px] text-stone-400 tracking-wide">Powered by AI</p>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              COMPARE MODE
          ══════════════════════════════════════════════════════════════ */}
          {mode === "compare" && (
            <div className="flex-1 overflow-y-auto flex flex-col bg-stone-50 min-h-0">
              <div className="px-4 py-3 bg-white border-b border-stone-100 shrink-0">
                <p className="text-xs text-stone-500 font-medium">
                  {compareSelections.length === 0 && "👇 Tap any two dishes to compare them"}
                  {compareSelections.length === 1 && "👇 Now pick one more dish to compare"}
                  {compareSelections.length === 2 && "✅ Scroll down to see the comparison"}
                </p>
              </div>

              <div className="px-4 py-3 grid grid-cols-2 gap-2 shrink-0">
                {menu.map(item => {
                  const selected = compareSelections.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleCompare(item.id)}
                      className={`
                        text-left p-3 rounded-xl border-2 transition-all text-sm
                        ${selected
                          ? "border-amber-500 bg-amber-50 shadow-md"
                          : "border-stone-100 bg-white hover:border-amber-200 hover:bg-amber-50/30"
                        }
                      `}
                    >
                      <p className="font-semibold text-stone-800 text-xs leading-tight">{item.name}</p>
                      <p className="text-amber-600 font-bold text-xs mt-1">${item.price.toFixed(2)}</p>
                      {selected && (
                        <p className="text-amber-600 text-[10px] mt-1.5 font-bold flex items-center gap-1">
                          <span>✓</span> Selected
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>

              {compareItems.length === 2 && (
                <div className="mx-4 mb-4 bg-white rounded-2xl border border-amber-100 shadow-md overflow-hidden shrink-0">
                  <div className="bg-gradient-to-r from-amber-800 to-amber-600 text-white
                                  text-xs font-bold text-center py-2.5 uppercase tracking-widest">
                    Head to Head
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-stone-100">
                    {compareItems.map(item => (
                      <div key={item.id} className="p-4 flex flex-col">
                        <p className="font-bold text-stone-800 text-sm leading-tight">{item.name}</p>
                        <p className="text-amber-600 font-bold text-xl mt-1">${item.price.toFixed(2)}</p>
                        <p className="text-xs text-stone-500 mt-2 leading-relaxed flex-1">
                          {item.description}
                        </p>
                        <button
                          onClick={() => {
                            adjustQty(item.id, 1);
                            setMode("order");
                            setMessages(prev => [...prev, {
                              role:    "assistant",
                              content: `${item.name} added to your cart! Here's the full menu. 🛒`,
                              ts:      nowTime(),
                            }]);
                          }}
                          className="mt-3 w-full text-xs bg-amber-600 hover:bg-amber-700
                                     text-white font-bold py-2 rounded-full transition-colors"
                        >
                          + Add to Order
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-center py-1.5 bg-white border-t border-stone-50 mt-auto shrink-0">
                <p className="text-[10px] text-stone-400 tracking-wide">Powered by AI</p>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              RESERVE MODE
          ══════════════════════════════════════════════════════════════ */}
          {mode === "reserve" && (
            <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4 bg-stone-50">
              {/* Header card */}
              <div className="flex items-center gap-3 bg-white rounded-2xl border border-stone-100
                              shadow-sm px-4 py-3.5">
                <div className="rounded-full overflow-hidden bg-amber-50 border border-amber-200 shrink-0">
                  <WaiterAvatar size={42} />
                </div>
                <div>
                  <p className="font-bold text-stone-800 text-sm">Reserve a Table</p>
                  <p className="text-xs text-stone-400 leading-relaxed mt-0.5">
                    Choose your preferences and I&apos;ll send you to our booking page.
                  </p>
                </div>
              </div>

              {/* Party size */}
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-4 py-4">
                <p className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-3">
                  Party Size
                </p>
                <div className="flex gap-2 flex-wrap">
                  {[1,2,3,4,5,6,7,8].map(n => (
                    <button
                      key={n}
                      onClick={() => setReserveParty(n)}
                      className={`
                        w-10 h-10 rounded-full text-sm font-bold border-2 transition-all
                        ${reserveParty === n
                          ? "bg-amber-600 border-amber-600 text-white shadow-sm"
                          : "border-stone-200 text-stone-600 hover:border-amber-400 hover:text-amber-700"
                        }
                      `}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-4 py-4">
                <p className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-3">Date</p>
                <input
                  type="date"
                  value={reserveDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={e => setReserveDate(e.target.value)}
                  className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-amber-400 bg-stone-50"
                />
              </div>

              {/* Time */}
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm px-4 py-4">
                <p className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-3">Time</p>
                <div className="grid grid-cols-3 gap-2">
                  {["17:30","18:00","18:30","19:00","19:30","20:00","20:30","21:00","21:30"].map(t => {
                    const [h, m] = t.split(":").map(Number);
                    const label = `${h > 12 ? h - 12 : h}:${m === 0 ? "00" : m} ${h >= 12 ? "PM" : "AM"}`;
                    return (
                      <button
                        key={t}
                        onClick={() => setReserveTime(t)}
                        className={`
                          py-2 rounded-xl text-xs font-semibold border-2 transition-all
                          ${reserveTime === t
                            ? "bg-amber-600 border-amber-600 text-white shadow-sm"
                            : "border-stone-200 text-stone-600 hover:border-amber-400 hover:text-amber-700"
                          }
                        `}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* CTA — 3 tiers */}
              {restaurant?.opentable_rid ? (
                <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-amber-800 to-amber-600 px-4 py-2.5">
                    <p className="text-white text-xs font-semibold text-center">
                      Live Availability via OpenTable
                    </p>
                  </div>
                  <iframe
                    src={`https://www.opentable.com/widget/reservation/canvas?rid=${restaurant.opentable_rid}&type=standard&theme=standard&color=1&dark=false&iframe=true&domain=com&lang=en-US&newtab=false&ot_source=Restaurant%20website&covers=${reserveParty}${reserveDate && reserveTime ? `&datetime=${reserveDate}T${reserveTime}:00` : ""}`}
                    width="100%"
                    height="310"
                    title="OpenTable Reservation Widget"
                    style={{ border: "none", overflow: "hidden" }}
                    className="w-full"
                  />
                </div>
              ) : restaurant?.reservation_url ? (
                <a
                  href={(() => {
                    try {
                      const url = new URL(restaurant.reservation_url);
                      url.searchParams.set("covers", String(reserveParty));
                      if (reserveDate && reserveTime)
                        url.searchParams.set("dateTime", `${reserveDate}T${reserveTime}`);
                      return url.toString();
                    } catch {
                      return restaurant.reservation_url;
                    }
                  })()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full bg-gradient-to-r from-amber-600 to-amber-500
                             hover:from-amber-700 hover:to-amber-600 text-white
                             font-bold py-3.5 rounded-full text-sm text-center
                             transition-all active:scale-95 shadow-md"
                >
                  Find a Table on OpenTable →
                </a>
              ) : (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-5 text-center">
                  <p className="text-sm text-stone-600 mb-2 font-medium">
                    Call us to check availability and book your table.
                  </p>
                  <a
                    href={`tel:${restaurant?.phone.replace(/\D/g, "")}`}
                    className="text-amber-700 font-bold text-base hover:underline inline-flex items-center gap-2"
                  >
                    📞 {restaurant?.phone}
                  </a>
                </div>
              )}

              <div className="text-center py-1 shrink-0">
                <p className="text-[10px] text-stone-400 tracking-wide">Powered by AI</p>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              CONFIRMATION MODE
          ══════════════════════════════════════════════════════════════ */}
          {mode === "confirmation" && (
            <div className="flex-1 overflow-y-auto px-5 py-6 flex flex-col items-center bg-stone-50">

              {/* Success icon */}
              <div className="w-20 h-20 rounded-full bg-green-100 border-4 border-green-200
                              flex items-center justify-center mb-4 shadow-inner">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
                     xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" stroke="#16a34a" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>

              <h3 className="text-xl font-bold text-stone-800 mb-1">Order Confirmed! 🎉</h3>
              <p className="text-stone-400 text-xs mb-6">
                Thank you for dining with{" "}
                <span className="text-stone-600 font-medium">{restaurant?.name}</span>
              </p>

              {/* Receipt card */}
              <div className="w-full bg-white rounded-2xl border border-stone-100 shadow-md overflow-hidden mb-6">
                {/* Receipt header */}
                <div className="bg-gradient-to-r from-stone-800 to-stone-700 px-4 py-3 flex justify-between items-center">
                  <p className="text-white font-bold text-sm">Receipt</p>
                  <p className="text-stone-400 text-xs font-mono">
                    #{orderId.slice(0, 8).toUpperCase()}
                  </p>
                </div>
                {/* Items */}
                <div className="px-4 py-4 space-y-2.5">
                  {cartItems.map(item => (
                    <div key={item.id}>
                      <div className="flex justify-between text-sm text-stone-700">
                        <span className="font-medium">{item.name}
                          <span className="text-stone-400 font-normal"> × {quantities[item.id]}</span>
                        </span>
                        <span className="font-semibold">
                          ${(item.price * (quantities[item.id] ?? 0)).toFixed(2)}
                        </span>
                      </div>
                      {adjustments[item.id] && (
                        <p className="text-[11px] text-amber-600 italic ml-2 mt-0.5">
                          ↳ {adjustments[item.id]}
                        </p>
                      )}
                    </div>
                  ))}
                  <div className="flex justify-between font-bold text-stone-900
                                  pt-3 mt-1 border-t border-dashed border-stone-200 text-base">
                    <span>Total</span>
                    <span className="text-amber-600">${cartTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-stone-400 text-center leading-relaxed mb-6">
                Your meal will be ready shortly. 🍷<br />
                Enjoy your dining experience!
              </p>

              <button
                onClick={resetAll}
                className="w-full border-2 border-amber-600 text-amber-700
                           hover:bg-amber-50 font-bold py-3 rounded-full
                           text-sm transition-all active:scale-95"
              >
                Start New Order
              </button>

              <div className="text-center mt-4">
                <p className="text-[10px] text-stone-400 tracking-wide">Powered by AI</p>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
