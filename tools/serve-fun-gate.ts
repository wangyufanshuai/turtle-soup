import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? "dist/v1.8-internal-rc-web-pwa");
const port = Number(process.argv[3] ?? 4173);
const host = "127.0.0.1";
const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8" };

if (!existsSync(resolve(root, "index.html"))) throw new Error(`Frozen v1.8 package missing: ${root}`);

const server = createServer((request, response) => {
  const pathname = decodeURIComponent((request.url ?? "/").split("?")[0]);
  const relative = pathname.replace(/^\/+/, "");
  let target = resolve(root, relative || "index.html");
  if (!target.startsWith(`${root}${sep}`) && target !== root) { response.writeHead(403).end("Forbidden"); return; }
  if (existsSync(target) && statSync(target).isDirectory()) target = resolve(target, "index.html");
  if (!existsSync(target) && existsSync(`${target}.html`)) target = `${target}.html`;
  if (!existsSync(target)) { response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found"); return; }
  const extension = extname(target).toLowerCase();
  response.writeHead(200, {
    "Content-Type": mime[extension] ?? "application/octet-stream",
    "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=300",
    ...(target.endsWith("sw.js") ? { "Service-Worker-Allowed": "/" } : {}),
  });
  response.end(readFileSync(target));
});

server.listen(port, host, () => console.log(`C01 Fun Gate server: http://${host}:${port}/case/c01-cold-room-knock/`));
