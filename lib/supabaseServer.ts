// lib/supabaseServer.ts
// Factory that creates a Supabase client using the service-role key.
// ONLY import this in server-side code (API routes, server components).
// The service-role key bypasses Row Level Security — never expose it to the browser.

import { createClient } from "@supabase/supabase-js";

export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
