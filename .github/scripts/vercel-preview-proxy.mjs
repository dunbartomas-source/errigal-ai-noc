import http from "node:http";
import https from "node:https";

const targetBase = String(process.env.EVAL_TARGET_URL ?? "").replace(/\/$/, "");
const bypassSecret = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "");
const port = Number(process.env.EVAL_PROXY_PORT ?? 4173);

if (!targetBase) {
  console.error("EVAL_TARGET_URL is required");
  process.exit(1);
}
if (!bypassSecret) {
  console.error("VERCEL_AUTOMATION_BYPASS_SECRET is required");
  process.exit(1);
}

const target = new URL(targetBase);
if (target.protocol !== "https:") {
  console.error("EVAL_TARGET_URL must use https");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const upstreamUrl = new URL(req.url || "/", target);
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;
  headers["x-vercel-protection-bypass"] = bypassSecret;

  const upstream = https.request(
    upstreamUrl,
    {
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on("error", (error) => {
    console.error(`Preview proxy upstream error: ${error.message}`);
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end("preview proxy upstream error");
  });

  req.pipe(upstream);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Protected preview proxy ready on http://127.0.0.1:${port}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
