"use client";

import { useEffect, useState } from "react";
import InvestigationChat from "./investigate/investigation-chat";
import { getSupabaseBrowserClient } from "./lib/supabase-browser";

export default function DashboardGate({ sessionId }: { sessionId?: string }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        window.location.replace("/sign-in");
        return;
      }
      setReady(true);
    });
  }, []);

  if (!ready) {
    return <main style={{ display: "grid", minHeight: "100vh", placeItems: "center", color: "#34455d", fontFamily: "system-ui, sans-serif" }}>Checking secure access…</main>;
  }

  return <InvestigationChat sessionId={sessionId} />;
}
