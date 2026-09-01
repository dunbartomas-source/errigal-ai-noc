import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const base = "https://raw.githubusercontent.com/dunbartomas-source/errigal-ai-noc/main";
const parts = Array.from({ length: 9 }, (_, i) => `source-v14.part.${String(i).padStart(2, "0")}`);
const chunks = [];
for (const part of parts) {
  const response = await fetch(`${base}/${part}`);
  if (!response.ok) throw new Error(`GitHub ${response.status} fetching ${part}`);
  chunks.push((await response.text()).trim());
}
const archive = Buffer.from(chunks.join(""), "base64");
const expected = "d7e2258ac64365cc77f4437f49b15afda127129f1e1a6bd1a46a6d0588fe0938";
const actual = createHash("sha256").update(archive).digest("hex");
if (actual !== expected) throw new Error(`SOURCE_CHECKSUM_FAILED expected=${expected} actual=${actual}`);
writeFileSync("source-v14.tgz", archive);
execFileSync("tar", ["-xzf", "source-v14.tgz"], { stdio: "inherit" });
console.log(`SOURCE_OK sha256=${actual}`);
