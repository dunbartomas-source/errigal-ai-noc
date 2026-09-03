import { readFileSync, rmSync, writeFileSync } from "node:fs";

const pagePath = "app/page.tsx";
let page = readFileSync(pagePath, "utf8");
const before = "function latestGuidedToolResult(messages: any[]): ToolResult | null";
const after = "function latestGuidedToolResult(messages: readonly any[]): ToolResult | null";

if (!page.includes(after)) {
  if (!page.includes(before)) {
    throw new Error("GUIDED_PAGE_TYPE_FIX_TARGET_NOT_FOUND");
  }
  page = page.replace(before, after);
  writeFileSync(pagePath, page);
}

for (const path of [
  "patch-v15",
  "patch-v16",
  "patch-v17",
  "patch-v18",
  "patch-v19",
  "patch-v19b",
  "patch-v19c",
  "patch-v19d",
  "patch-v110",
  "patch-v110b",
  "patch-v111",
]) {
  rmSync(path, { recursive: true, force: true });
}

for (const path of ["source-v14.tgz", "patch-v112.tgz"]) {
  rmSync(path, { force: true });
}

console.log("POST_RECONSTRUCTION_FIXES_OK release=v1.12.0");
