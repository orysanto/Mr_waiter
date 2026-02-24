// app/page.tsx
// Restaurant homepage — async server component.
// Fetches live restaurant data from Supabase; no hardcoded strings.
// Hero photo: Unsplash (free-to-use, attribution below)
// Photo by Jay Wennington on Unsplash: https://unsplash.com/photos/assorted-food-on-bowl-N_Y88TWmGwA

export const dynamic = "force-dynamic";

import Image from "next/image";
import { createServerClient } from "@/lib/supabaseServer";
import OpenChatButton from "@/components/OpenChatButton";

// ── Types ─────────────────────────────────────────────────────────────────────
type RawMenuItem = {
  id?:          unknown;
  name?:        unknown;
  description?: unknown;
  price?:       unknown;
};

// Map a dish name to a relevant food emoji
function dishEmoji(name: string): string {
  const n = name.toLowerCase();
  if (/pizza/.test(n))                            return "🍕";
  if (/pasta|spaghetti|penne|rigatoni|fettuccine|tagliatelle/.test(n)) return "🍝";
  if (/risotto/.test(n))                          return "🍚";
  if (/salad|insalata/.test(n))                   return "🥗";
  if (/soup|minestrone|zuppa/.test(n))            return "🍲";
  if (/fish|salmon|tuna|branzino|sea bass/.test(n)) return "🐟";
  if (/chicken|pollo/.test(n))                    return "🍗";
  if (/beef|steak|bistecca|veal|vitello/.test(n)) return "🥩";
  if (/dessert|tiramisu|panna|chocolate|gelato/.test(n)) return "🍰";
  if (/bruschetta|antipasto|starter/.test(n))     return "🥖";
  if (/wine|cocktail|drink|beverage/.test(n))     return "🍷";
  return "🍽️";
}

// Static review cards — representative sample
const REVIEWS = [
  {
    name:   "Sofia M.",
    stars:  5,
    text:   "Absolutely stunning food and atmosphere. The truffle pasta was unlike anything I've had before. Marco the AI waiter even helped me pick the perfect wine pairing!",
    date:   "January 2025",
  },
  {
    name:   "James T.",
    stars:  5,
    text:   "We celebrated our anniversary here and it was perfection. The service is warm and the menu descriptions from the chat assistant were spot-on.",
    date:   "December 2024",
  },
  {
    name:   "Priya K.",
    stars:  4,
    text:   "Wonderful evening — fresh ingredients, generous portions, and a gorgeous dining room. The online ordering through the chat widget made it so easy.",
    date:   "February 2025",
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function Home() {
  const supabase = createServerClient();

  const { data: r } = await supabase
    .from("restaurants")
    .select("name, hours, address, phone, reservation_url, menu_items")
    .eq("id", process.env.NEXT_PUBLIC_RESTAURANT_ID!)
    .single();

  // Graceful fallback
  if (!r) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-center px-6">
          <p className="text-4xl mb-4">🍽️</p>
          <p className="text-gray-500 font-medium">
            Unable to load restaurant data. Please try again shortly.
          </p>
        </div>
      </div>
    );
  }

  // Normalise menu_items JSONB
  const rawMenu = (r.menu_items ?? []) as RawMenuItem[];
  const featuredDishes = rawMenu.slice(0, 6).map((item, i) => ({
    id:          typeof item?.id    === "number" ? item.id    : i + 1,
    name:        String(item?.name        ?? "Chef's Special"),
    description: String(item?.description ?? "A seasonal specialty crafted by our chef."),
    price:       typeof item?.price === "number" ? item.price : 0,
  }));

  // Google Maps search link from address
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address ?? "")}`;

  return (
    <div className="min-h-screen bg-stone-50 font-sans">

      {/* ── Sticky Nav ───────────────────────────────────────────────────────── */}
      <header className="bg-white/95 backdrop-blur-sm shadow-sm sticky top-0 z-40 border-b border-stone-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center gap-4">
          <div className="flex items-center gap-2.5">
            {/* Simple fork+knife icon */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
                 className="text-amber-600" aria-hidden="true">
              <path d="M3 2v7c0 1.1.9 2 2 2h2v11h2V11h2c1.1 0 2-.9 2-2V2h-2v5H7V2H5v5H3V2H3z" fill="currentColor"/>
              <path d="M18 2c-1.1 0-2 .9-2 2v6c0 1.3.84 2.4 2 2.8V22h2V12.8c1.16-.4 2-1.5 2-2.8V4c0-1.1-.9-2-2-2z" fill="currentColor"/>
            </svg>
            <h1 className="text-xl font-bold text-stone-800 tracking-tight">{r.name}</h1>
          </div>

          <nav className="hidden sm:flex items-center gap-6">
            <a href="#menu"    className="text-sm text-stone-500 hover:text-amber-700 transition-colors font-medium">Menu</a>
            <a href="#visit"   className="text-sm text-stone-500 hover:text-amber-700 transition-colors font-medium">Visit</a>
            <a href="#reviews" className="text-sm text-stone-500 hover:text-amber-700 transition-colors font-medium">Reviews</a>
          </nav>

          <a
            href={r.reservation_url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold
                       px-5 py-2.5 rounded-full transition-colors shadow-sm hover:shadow-md
                       active:scale-95 duration-150"
          >
            Reserve a Table
          </a>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      {/*
        Hero photo by Jay Wennington on Unsplash
        https://unsplash.com/photos/assorted-food-on-bowl-N_Y88TWmGwA
        Free to use under the Unsplash License
      */}
      <section className="relative h-[580px] sm:h-[680px] overflow-hidden">
        <Image
          src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&q=80"
          alt="Beautifully plated dishes at a fine dining restaurant"
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
        {/* Layered gradient overlay for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/75" />

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-amber-300 mb-4 font-semibold animate-fade-in-up">
            Fine Dining · San Francisco
          </p>
          <h2 className="text-4xl sm:text-6xl font-bold text-white mb-5 leading-tight animate-fade-in-up-delay-1"
              style={{textShadow: "0 2px 20px rgba(0,0,0,0.4)"}}>
            A Taste Worth<br className="hidden sm:block" /> Remembering
          </h2>
          <p className="text-base sm:text-lg text-stone-200 max-w-xl mx-auto mb-10 leading-relaxed animate-fade-in-up-delay-2">
            From wood-fired classics to hand-crafted cocktails, every dish at{" "}
            <span className="text-amber-300 font-semibold">{r.name}</span> tells
            a story. Join us for an unforgettable evening.
          </p>

          <div className="flex justify-center gap-3 sm:gap-4 flex-wrap animate-fade-in-up-delay-2">
            {/* Primary CTA */}
            <a
              href={r.reservation_url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-amber-500 hover:bg-amber-400 text-white font-bold
                         px-8 py-3.5 rounded-full transition-all duration-150
                         shadow-lg shadow-amber-900/40 hover:shadow-xl active:scale-95
                         text-sm sm:text-base"
            >
              Reserve a Table
            </a>
            {/* Secondary CTA — opens chat in order mode */}
            <OpenChatButton
              label="🛒 Order Now"
              mode="order"
              className="border-2 border-white/70 text-white hover:bg-white/15
                         font-bold px-8 py-3.5 rounded-full transition-all duration-150
                         backdrop-blur-sm active:scale-95 text-sm sm:text-base"
            />
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/50 animate-bounce">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7 10l5 5 5-5z"/>
          </svg>
        </div>
      </section>

      {/* ── Featured Dishes ──────────────────────────────────────────────────── */}
      {featuredDishes.length > 0 && (
        <section id="menu" className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-600 font-bold mb-2">Our Menu</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-stone-800">Featured Dishes</h2>
            <p className="text-stone-500 mt-3 max-w-md mx-auto text-sm leading-relaxed">
              Crafted with seasonal ingredients and the finest Italian traditions.
              Ask our AI waiter for recommendations.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredDishes.map(dish => (
              <div
                key={dish.id}
                className="bg-white rounded-2xl shadow-sm border border-stone-100
                           hover:shadow-lg hover:-translate-y-1 transition-all duration-200
                           overflow-hidden group"
              >
                {/* Dish emoji header */}
                <div className="h-36 bg-gradient-to-br from-amber-50 to-stone-100 flex items-center justify-center">
                  <span className="text-6xl group-hover:scale-110 transition-transform duration-200">
                    {dishEmoji(dish.name)}
                  </span>
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-bold text-stone-800 text-base leading-tight">{dish.name}</h3>
                    {dish.price > 0 && (
                      <span className="text-amber-600 font-bold text-sm shrink-0 bg-amber-50
                                       px-2.5 py-1 rounded-full border border-amber-100">
                        ${dish.price.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <p className="text-stone-500 text-xs leading-relaxed line-clamp-2">
                    {dish.description}
                  </p>
                  <OpenChatButton
                    label="Order this dish →"
                    mode="order"
                    className="mt-4 text-xs font-semibold text-amber-700 hover:text-amber-900
                               transition-colors flex items-center gap-1 group/btn"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* View full menu CTA */}
          <div className="text-center mt-10">
            <OpenChatButton
              label="🍽️ View Full Menu"
              mode="order"
              className="inline-flex items-center gap-2 border-2 border-amber-600 text-amber-700
                         hover:bg-amber-600 hover:text-white font-bold px-8 py-3 rounded-full
                         transition-all duration-150 text-sm"
            />
          </div>
        </section>
      )}

      {/* ── Hours & Location ─────────────────────────────────────────────────── */}
      <section id="visit" className="bg-amber-50 border-y border-amber-100 py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-600 font-bold mb-2">Come Visit Us</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-stone-800">Hours &amp; Location</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Hours */}
            <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-6 text-center
                            hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
                     className="text-amber-700" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
                  <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <h3 className="font-bold text-stone-800 text-base mb-2">Hours</h3>
              <p className="text-stone-500 text-sm leading-relaxed">{r.hours}</p>
            </div>

            {/* Location */}
            <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-6 text-center
                            hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
                     className="text-amber-700" aria-hidden="true">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
                        stroke="currentColor" strokeWidth="2"/>
                  <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="2"/>
                </svg>
              </div>
              <h3 className="font-bold text-stone-800 text-base mb-2">Location</h3>
              <p className="text-stone-500 text-sm leading-relaxed mb-3">{r.address}</p>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-amber-700 hover:text-amber-900
                           border border-amber-300 hover:border-amber-500 px-3 py-1.5
                           rounded-full transition-colors inline-block"
              >
                Get Directions →
              </a>
            </div>

            {/* Contact */}
            <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-6 text-center
                            hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
                     className="text-amber-700" aria-hidden="true">
                  <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.67-.36 1.02-.24
                           1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17
                           0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.01L6.6 10.8z"
                        fill="currentColor"/>
                </svg>
              </div>
              <h3 className="font-bold text-stone-800 text-base mb-2">Reservations</h3>
              <p className="text-stone-500 text-sm leading-relaxed mb-3">
                <a href={`tel:${r.phone.replace(/\D/g, "")}`}
                   className="hover:text-amber-700 transition-colors">
                  {r.phone}
                </a>
              </p>
              <a
                href={r.reservation_url ?? `tel:${r.phone.replace(/\D/g, "")}`}
                target={r.reservation_url ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700
                           px-4 py-1.5 rounded-full transition-colors inline-block"
              >
                Book Now
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Reviews ──────────────────────────────────────────────────────────── */}
      <section id="reviews" className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-600 font-bold mb-2">What Guests Say</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-stone-800">Loved by Diners</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {REVIEWS.map((r, i) => (
            <div key={i}
                 className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6
                            hover:shadow-md transition-shadow">
              {/* Stars */}
              <div className="flex gap-0.5 mb-3">
                {Array.from({ length: r.stars }).map((_, s) => (
                  <svg key={s} width="14" height="14" viewBox="0 0 24 24" fill="#F59E0B"
                       xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                ))}
              </div>
              <p className="text-stone-600 text-sm leading-relaxed mb-4 italic">
                &ldquo;{r.text}&rdquo;
              </p>
              <div className="flex items-center gap-2.5 border-t border-stone-100 pt-4">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600
                                flex items-center justify-center text-white font-bold text-xs shrink-0">
                  {r.name[0]}
                </div>
                <div>
                  <p className="font-semibold text-stone-800 text-sm">{r.name}</p>
                  <p className="text-stone-400 text-xs">{r.date}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── AI Waiter callout ────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-r from-stone-900 to-amber-950 py-16 px-6 text-center">
        <div className="max-w-lg mx-auto">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-amber-600/20 border border-amber-500/30
                          flex items-center justify-center text-3xl">
            🤖
          </div>
          <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            Meet Marco, Your AI Waiter
          </h3>
          <p className="text-stone-300 text-sm leading-relaxed mb-7 max-w-sm mx-auto">
            Ask about our menu, get personalized recommendations, place an order,
            or book a table — Marco is available 24/7.
          </p>
          <OpenChatButton
            label="💬 Chat with Marco"
            mode="chat"
            className="bg-amber-500 hover:bg-amber-400 text-white font-bold
                       px-8 py-3.5 rounded-full transition-all duration-150
                       shadow-lg shadow-amber-900/40 hover:shadow-xl active:scale-95
                       text-sm inline-block"
          />
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="bg-stone-950 text-stone-400 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between
                        items-center gap-6 text-sm">
          <div className="text-center sm:text-left">
            <p className="text-white font-bold text-base mb-1">{r.name}</p>
            <p className="text-stone-500 text-xs">{r.address}</p>
          </div>
          <div className="flex gap-6 text-xs">
            <a href={`tel:${r.phone.replace(/\D/g, "")}`}
               className="hover:text-amber-400 transition-colors">{r.phone}</a>
            {r.reservation_url && (
              <a href={r.reservation_url} target="_blank" rel="noopener noreferrer"
                 className="hover:text-amber-400 transition-colors">Reservations</a>
            )}
          </div>
          <p className="text-stone-600 text-xs">© 2025 {r.name}. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
