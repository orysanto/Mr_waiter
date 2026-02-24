"use client";
// app/admin/page.tsx
// Hidden demo admin page — navigate to /admin to edit the restaurant record.
// No authentication. Add auth before any production deployment.

// Force dynamic rendering — this page loads live DB data on mount.
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";

interface FormState {
  id: string;
  name: string;
  address: string;
  hours: string;
  phone: string;
  reservation_url: string;
  opentable_rid: string;
  menu_items: string;   // stored as a raw JSON string while editing
  menu_text: string;
}

const EMPTY: FormState = {
  id: "", name: "", address: "", hours: "",
  phone: "", reservation_url: "", opentable_rid: "", menu_items: "[]", menu_text: "",
};

export default function AdminPage() {
  const [form,      setForm]      = useState<FormState>(EMPTY);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [loadErr,   setLoadErr]   = useState("");
  const [saveErr,   setSaveErr]   = useState("");
  const [jsonErr,   setJsonErr]   = useState("");

  const restaurantId = process.env.NEXT_PUBLIC_RESTAURANT_ID ?? "";

  // ── Load existing restaurant data via server-side GET ──────────────────
  useEffect(() => {
    if (!restaurantId) {
      setLoadErr("NEXT_PUBLIC_RESTAURANT_ID is not set.");
      setLoading(false);
      return;
    }
    fetch(`/api/admin/restaurant?id=${restaurantId}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) { setLoadErr(data.error); return; }
        setForm({
          id:              data.id,
          name:            data.name            ?? "",
          address:         data.address         ?? "",
          hours:           data.hours           ?? "",
          phone:           data.phone           ?? "",
          reservation_url: data.reservation_url ?? "",
          opentable_rid:   data.opentable_rid   ?? "",
          menu_items:      JSON.stringify(data.menu_items ?? [], null, 2),
          menu_text:       data.menu_text        ?? "",
        });
      })
      .catch(() => setLoadErr("Network error — check your connection."))
      .finally(() => setLoading(false));
  }, [restaurantId]);

  // Shared change handler for all fields
  const set = (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm(prev => ({ ...prev, [field]: e.target.value }));
      setSaved(false);
      setSaveErr("");
      if (field === "menu_items") setJsonErr("");
    };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setJsonErr("");
    setSaveErr("");
    setSaved(false);

    // Validate menu_items is valid JSON before sending
    let parsedMenu: unknown;
    try {
      parsedMenu = JSON.parse(form.menu_items);
    } catch {
      setJsonErr("menu_items is not valid JSON — fix the syntax and try again.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/restaurant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, menu_items: parsedMenu }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSaved(true);
    } catch (err: unknown) {
      setSaveErr(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // ── Loading / error states ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">Loading restaurant data…</p>
      </div>
    );
  }
  if (loadErr) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-500 font-medium">{loadErr}</p>
          <p className="text-gray-400 text-sm mt-2">
            Check your .env.local and Supabase connection.
          </p>
        </div>
      </div>
    );
  }

  // ── Editor form ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-stone-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Restaurant Admin</h1>
          <p className="text-sm text-gray-400 mt-1">
            Demo editor — changes save directly to Supabase.{" "}
            <span className="text-amber-600">No auth required (demo only).</span>
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-5">

          {/* Basic text fields */}
          {(["name", "address", "hours", "phone", "reservation_url", "opentable_rid"] as const).map(field => (
            <div key={field}>
              <label className="block text-sm font-semibold text-gray-700 mb-1 capitalize">
                {field.replace(/_/g, " ")}
              </label>
              <input
                type="text"
                value={form[field]}
                onChange={set(field)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          ))}

          {/* menu_items — JSON textarea */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              menu_items{" "}
              <span className="text-gray-400 font-normal">
                (JSON array — used by the order widget)
              </span>
            </label>
            <textarea
              value={form.menu_items}
              onChange={set("menu_items")}
              rows={12}
              spellCheck={false}
              className="w-full border border-gray-200 rounded-xl px-4 py-2 text-xs
                         font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder='[{"id":1,"name":"Truffle Risotto","description":"...","price":24}]'
            />
            {jsonErr && <p className="text-red-500 text-xs mt-1">{jsonErr}</p>}
          </div>

          {/* menu_text — plain text for AI grounding */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              menu_text{" "}
              <span className="text-gray-400 font-normal">
                (plain text — read by the AI to answer questions accurately)
              </span>
            </label>
            <textarea
              value={form.menu_text}
              onChange={set("menu_text")}
              rows={10}
              className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="Describe each dish, prices, allergens, and any policies the AI should know…"
            />
          </div>

          {/* Save controls */}
          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white
                         font-bold px-8 py-2.5 rounded-full text-sm transition-colors"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
            {saved    && <p className="text-green-600 text-sm font-medium">✓ Saved successfully!</p>}
            {saveErr  && <p className="text-red-500 text-sm">{saveErr}</p>}
          </div>

        </form>
      </div>
    </div>
  );
}
