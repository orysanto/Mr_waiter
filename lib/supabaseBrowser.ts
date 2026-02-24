// lib/supabaseBrowser.ts
// Supabase client for use in browser / "use client" components.
// Uses a lazy singleton so the client is only created on the first call —
// this prevents errors during Next.js SSR prerendering when env vars hold
// placeholder values (e.g. before the user has filled in .env.local).

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _client;
}
