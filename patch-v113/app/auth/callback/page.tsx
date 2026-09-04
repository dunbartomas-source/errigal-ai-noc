"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase-browser";

export default function AuthCallbackPage() {
  const [message, setMessage] = useState("Completing secure sign-in…");

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) {
      setMessage("This sign-in link is missing its confirmation code. Please request a new link.");
      return;
    }
    void getSupabaseBrowserClient().auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        setMessage(`We could not complete sign-in: ${error.message}`);
        return;
      }
      window.location.replace("/");
    });
  }, []);

  return <main style={{ display: "grid", minHeight: "100vh", placeItems: "center", padding: 24, color: "#34455d", fontFamily: "system-ui, sans-serif" }}>{message}</main>;
}
