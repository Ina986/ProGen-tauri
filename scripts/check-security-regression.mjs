import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fail = [];

function assert(condition, message) {
  if (!condition) fail.push(message);
}

function json(file) {
  return JSON.parse(read(file));
}

const packageJson = json("package.json");
const tauriConf = json("src-tauri/tauri.conf.json");
const capability = json("src-tauri/capabilities/default.json");
const cargoToml = read("src-tauri/Cargo.toml");
const rust = read("src-tauri/src/lib.rs");
const html = read("src/index.html");
const allSource = [
  cargoToml,
  rust,
  html,
  read("src-tauri/tauri.conf.json"),
  read("src-tauri/capabilities/default.json"),
  read("src/js/tauri-bridge.js"),
].join("\n");

assert(
  packageJson.scripts?.["check:security"] === "node scripts/check-security-regression.mjs",
  "package.json must expose npm run check:security",
);

const permissions = JSON.stringify(capability.permissions);
assert(!permissions.includes('"fs:read-all"'), "Tauri fs:read-all must not be granted");
assert(!permissions.includes('"path":"**"'), "Tauri fs scope must not include **");
assert(!permissions.includes('"path": "**"'), "Tauri fs scope must not include **");

const assetScope = tauriConf.app?.security?.assetProtocol?.scope ?? [];
assert(Array.isArray(assetScope), "assetProtocol.scope must be an array");
assert(!assetScope.includes("**"), "assetProtocol.scope must not include **");
assert(!assetScope.includes("$TEMP/**"), "assetProtocol.scope must not allow all temp files");
assert(assetScope.includes("$TEMP/ProGen/**"), "assetProtocol.scope must be limited to $TEMP/ProGen/**");

const csp = tauriConf.app?.security?.csp ?? "";
assert(typeof csp === "string" && csp.length > 0, "Tauri CSP must be enabled");
for (const directive of ["script-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) {
  assert(csp.includes(directive), `Tauri CSP must include ${directive}`);
  assert(html.includes(directive), `Dev HTML meta CSP must include ${directive}`);
}

assert(!/\bdevtools\b/.test(cargoToml), "Release dependency features must not include devtools");

for (const name of [
  "authorize_user_paths",
  "allowPath",
  "registerPath",
  "confirm_file_picker_paths",
]) {
  assert(!allSource.includes(name), `Forbidden arbitrary path API found: ${name}`);
}

assert(rust.includes("fs::canonicalize"), "Rust path checks must canonicalize paths");
assert(rust.includes("ensure_allowed_path"), "Read/list APIs must use ensure_allowed_path");
assert(rust.includes("ensure_allowed_parent"), "Write APIs must use ensure_allowed_parent");
assert(rust.includes("register_allowed_path"), "Trusted entry points must register session paths internally");
assert(rust.includes("fn handoff_dir()"), "Handoff paths must be constrained to a fixed directory");
assert(rust.includes("forbidden handoff path"), "Handoff marker contents must be revalidated before reading");
assert(rust.includes("WindowEvent::DragDrop"), "Real drag-and-drop must be registered from Rust window events");
assert(rust.includes("DragDropEvent::Drop"), "Dropped paths must be registered from Rust window events");
assert(!rust.includes("DragDropEvent::Enter { paths"), "Drag enter must not grant file access before an actual drop");
assert(rust.includes('join("ProGen")'), "Temp output must use the ProGen app-specific temp folder");
assert(!rust.includes("let cache_dir = std::env::temp_dir();"), "Preview cache must not use generic temp root");
assert(rust.includes("validate_path_component"), "Path component validation must be implemented");
assert(rust.includes('matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")'), "Windows reserved names must be rejected");

if (fail.length > 0) {
  console.error("Security regression check failed:");
  for (const message of fail) console.error(`- ${message}`);
  process.exit(1);
}

console.log("Security regression check passed");
