"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase-browser";

export default function AuthCallbackPage() {
  const [message, setMessage] = useState("Completing secure sign-in…");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const finish = () => window.location.replace("/");
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        setMessage(`We could not complete sign-in: ${error.message}`);
      } else if (data.session) {
        finish();
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) finish();
    });
    const timeout = window.setTimeout(() => {
      setMessage("This sign-in link has expired or has already been used. Please request a new link.");
    }, 5000);
    return () => {
      listener.subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, []);

  return <main style={{ display: "grid", minHeight: "100vh", placeItems: "center", padding: 24, color: "#34455d", fontFamily: "system-ui, sans-serif" }}>{message}</main>;
}
