"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// These are public project coordinates, not administrator credentials. Vercel
// environment variables override them so a future environment can use its own
// Supabase project without a source change.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://uwtzymebvqsnyplezeqc.supabase.co";
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_CmOA-dXjPk4wAXTzYvWvDg_EMgQR31M";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient() {
  browserClient ??= createBrowserClient(supabaseUrl, supabasePublishableKey, {
    auth: { flowType: "pkce" },
  });
  return browserClient;
}
