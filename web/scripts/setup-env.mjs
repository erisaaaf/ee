// Creates .env from .env.example with freshly generated secrets.
// Never overwrites existing non-empty values.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const examplePath = new URL("../.env.example", import.meta.url);
const envPath = new URL("../.env", import.meta.url);

const parse = (text) => {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) map.set(m[1], m[2].replace(/^"|"$/g, ""));
  }
  return map;
};

const example = readFileSync(examplePath, "utf8");
const current = existsSync(envPath) ? parse(readFileSync(envPath, "utf8")) : new Map();

const generated = {
  APP_ENCRYPTION_KEY: () => randomBytes(32).toString("base64"),
};

const out = example
  .split(/\r?\n/)
  .map((line) => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) return line;
    const key = m[1];
    const existing = current.get(key);
    if (existing) return `${key}="${existing}"`;
    if (generated[key]) return `${key}="${generated[key]()}"`;
    return line;
  })
  .join("\n");

writeFileSync(envPath, out);
console.log(".env ready (existing values preserved).");
