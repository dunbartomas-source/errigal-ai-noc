"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";
import styles from "./sign-in.module.css";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void getSupabaseBrowserClient().auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace("/");
    });
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail || sending) return;
    setSending(true);
    setMessage("");
    const { error } = await getSupabaseBrowserClient().auth.signInWithOtp({
      email: cleanEmail,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setMessage(error ? `We could not send that link: ${error.message}` : "Check your inbox for your secure sign-in link.");
    setSending(false);
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.mark}>E</div>
        <div className={styles.eyebrow}>ERRIGAL AI-NOC</div>
        <h1>Sign in to your investigation workspace</h1>
        <p>We’ll email you a one-time link. No password is required.</p>
        <form onSubmit={submit}>
          <label htmlFor="work-email">Work email</label>
          <input autoComplete="email" id="work-email" onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required type="email" value={email} />
          <button disabled={sending} type="submit">{sending ? "Sending link…" : "Email me a sign-in link"}</button>
        </form>
        {message ? <div className={styles.message}>{message}</div> : null}
        <small>Read-only guidance. No device, alarm, or ticket changes are made automatically.</small>
      </section>
    </main>
  );
}
