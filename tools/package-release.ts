import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const outDir = resolve(root, "apps/web/out");
const distDir = resolve(root, "dist");
const webDir = resolve(distDir, "web-pwa");
const itchDir = resolve(distDir, "itch-html5");
const c01Dir = resolve(distDir, "c01-fun-gate");

function insideRoot(path: string) {
  const normalizedRoot = `${root.toLowerCase()}${sep}`;
  if (!path.toLowerCase().startsWith(normalizedRoot)) throw new Error(`Refusing operation outside workspace: ${path}`);
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = resolve(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

function directoryDigest(dir: string) {
  const hash = createHash("sha256");
  const entries = files(dir).sort();
  for (const path of entries) {
    hash.update(relative(dir, path).split(sep).join("/"));
    hash.update(readFileSync(path));
  }
  return { files: entries.length, bytes: entries.reduce((sum, path) => sum + statSync(path).size, 0), sha256: hash.digest("hex") };
}

function requestPath(base: string, path: string) {
  const name = relative(base, path).split(sep).join("/");
  if (name === "index.html") return "/";
  if (name.endsWith("/index.html")) return `/${name.slice(0, -"index.html".length)}`;
  return `/${name}`;
}

function writeServiceWorker(target: string, cacheName: string) {
  const template = readFileSync(resolve(root, "apps/web/public/sw.js"), "utf8").replace(/const CACHE_NAME = "[^"]+";/, `const CACHE_NAME = "${cacheName}";`);
  const precache = files(target).filter((path) => !path.endsWith("sw.js") && !path.endsWith(".map")).map((path) => requestPath(target, path)).sort();
  writeFileSync(resolve(target, "sw.js"), template.replace(/const PRECACHE = \[[\s\S]*?\];/, `const PRECACHE = ${JSON.stringify(precache, null, 2)};`), "utf8");
}

function prepareItchPackage(target: string) {
  const runtime = `(() => {
  const script = document.currentScript;
  const root = new URL(script?.dataset.itchRoot || "./", location.href);
  const rewrite = (value) => {
    if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return value;
    const absolute = new URL(value, location.origin);
    return absolute.pathname.startsWith(root.pathname) ? absolute.href : new URL("." + value, root).href;
  };
  const patchNode = (node) => {
    if (!(node instanceof Element)) return;
    for (const attribute of ["href", "src", "action"]) {
      const value = node.getAttribute(attribute);
      if (value?.startsWith("/") && !value.startsWith("//")) node.setAttribute(attribute, rewrite(value));
    }
    node.querySelectorAll?.("[href^='/'],[src^='/'],[action^='/']").forEach(patchNode);
  };
  new MutationObserver((records) => records.forEach((record) => patchNode(record.target))).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["href", "src", "action"] });
  addEventListener("DOMContentLoaded", () => patchNode(document.documentElement));
  addEventListener("click", (event) => {
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = new URL(anchor.href, location.href);
    if (target.origin === location.origin && target.href.startsWith(root.href)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      location.assign(target.href);
    }
  }, true);
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => nativeFetch(typeof input === "string" ? rewrite(input) : input instanceof Request && input.url.startsWith(location.origin + "/") ? new Request(rewrite(new URL(input.url).pathname + new URL(input.url).search), input) : input, init);
  const nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) { return nativeOpen.call(this, method, rewrite(String(url)), ...rest); };
  for (const method of ["pushState", "replaceState"]) {
    const native = history[method].bind(history);
    history[method] = (state, unused, url) => native(state, unused, typeof url === "string" ? rewrite(url) : url);
  }
  if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.reject(new Error("PWA registration is disabled inside the itch.io subpath preview package"));
  window.__TURTLE_SOUP_ITCH_BASE__ = root.href;
})();`;
  writeFileSync(resolve(target, "itch-runtime.js"), runtime, "utf8");
  for (const path of files(target).filter((path) => path.endsWith(".html"))) {
    const relativeRoot = relative(dirname(path), target).split(sep).join("/") || ".";
    const prefix = relativeRoot === "." ? "./" : `${relativeRoot}/`;
    let html = readFileSync(path, "utf8");
    html = html.replace(/<link rel="manifest"[^>]*>/g, "");
    html = html.replace(/((?:src|href|action)=["'])\/(?!\/)/g, `$1${prefix}`);
    html = html.replaceAll('\\"/', `\\"${prefix}`);
    html = html.replace("<head>", `<head><script data-itch-root="${prefix}" src="${prefix}itch-runtime.js"></script>`);
    writeFileSync(path, html, "utf8");
  }
  const webpackRuntime = files(target).find((path) => /[\\/]webpack-[^\\/]+\.js$/.test(path));
  if (!webpackRuntime) throw new Error("itch package webpack runtime missing");
  const webpackSource = readFileSync(webpackRuntime, "utf8");
  const patchedWebpack = webpackSource.replace(/([A-Za-z_$][\w$]*)\.p="\/_next\/"/, '$1.p=new URL("../../",document.currentScript.src).href');
  if (patchedWebpack === webpackSource) throw new Error("itch package webpack public path marker missing");
  writeFileSync(webpackRuntime, patchedWebpack, "utf8");
  writeFileSync(resolve(target, "ITCH-README.txt"), "TURTLE SOUP v0.9 itch.io HTML5 preview\r\n\r\nUpload the ZIP as an HTML5 project. This package resolves assets and routes from the runtime archive subpath. PWA installation is intentionally disabled in this preview build; use the Web/PWA artifact for installable offline deployment.\r\n", "utf8");
}

function zipDirectory(source: string, destination: string) {
  if (existsSync(destination)) unlinkSync(destination);
  const quote = (value: string) => value.replaceAll("'", "''");
  execFileSync("powershell.exe", ["-NoProfile", "-Command", `Compress-Archive -Path '${quote(source)}\\*' -DestinationPath '${quote(destination)}' -CompressionLevel Optimal -Force`], { stdio: "inherit" });
}

insideRoot(distDir);
if (!existsSync(outDir)) throw new Error("Run npm run build before packaging");
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
cpSync(outDir, webDir, { recursive: true });
cpSync(outDir, itchDir, { recursive: true });
cpSync(outDir, c01Dir, { recursive: true });
prepareItchPackage(itchDir);

const manifest = JSON.parse(readFileSync(resolve(root, "content/zh/cases/manifest.v0.6.json"), "utf8")) as { cases: Array<{ id: string }> };
for (const entry of manifest.cases) if (entry.id !== "c01-cold-room-knock") rmSync(resolve(c01Dir, "case", entry.id), { recursive: true, force: true });
for (const name of readdirSync(c01Dir)) if (/^scene-.*\.svg$/.test(name) && name !== "scene-cold-room.svg") unlinkSync(resolve(c01Dir, name));
writeFileSync(resolve(c01Dir, "index.html"), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#08090b"><meta http-equiv="refresh" content="0;url=/case/c01-cold-room-knock/"><title>深汤 C01 正式 Fun Gate</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#08090b;color:#e8e2d1;font:18px sans-serif"><main><h1>正在打开冻结的 C01 评测构建…</h1><p><a style="color:#b8cf79" href="/case/c01-cold-room-knock/">如果没有自动跳转，请打开第一案</a></p></main></body></html>`, "utf8");
writeFileSync(resolve(c01Dir, "TESTER-INSTRUCTIONS.txt"), "TURTLE SOUP C01 正式 Fun Gate 冻结构建\r\n\r\n请独立调查，不查看开发者工具、源码或答案讨论。系统回答用于验证事实。真人评测状态：PENDING。\r\n", "utf8");
writeServiceWorker(c01Dir, "black-soup-v09-c01-eval1");

const webZip = resolve(distDir, "turtle-soup-v0.9-web-pwa.zip");
const itchZip = resolve(distDir, "turtle-soup-v0.9-itch-html5.zip");
const c01Zip = resolve(distDir, "turtle-soup-v0.9-c01-fun-gate.zip");
zipDirectory(webDir, webZip);
zipDirectory(itchDir, itchZip);
zipDirectory(c01Dir, c01Zip);

const zip = (path: string) => ({ path: relative(root, path).split(sep).join("/"), bytes: statSync(path).size, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") });
const report = {
  reportVersion: "0.9",
  generatedAt: new Date().toISOString(),
  humanFunGate: "pending",
  artifacts: {
    webPwa: { path: "dist/web-pwa", ...directoryDigest(webDir), archive: zip(webZip) },
    itchHtml5: { path: "dist/itch-html5", ...directoryDigest(itchDir), archive: zip(itchZip) },
    c01FunGate: { path: "dist/c01-fun-gate", ...directoryDigest(c01Dir), archive: zip(c01Zip), includedCaseRoutes: ["c01-cold-room-knock"] },
  },
  frozenCaseCount: manifest.cases.length,
  passed: manifest.cases.length === 12 && existsSync(resolve(c01Dir, "case/c01-cold-room-knock/index.html")) && !existsSync(resolve(c01Dir, "case/c02-snow-route")),
};
writeFileSync(resolve(distDir, "release-manifest.json"), JSON.stringify(report, null, 2), "utf8");
writeFileSync(resolve(root, "docs/v0.9-release-artifacts.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ reportPath: resolve(root, "docs/v0.9-release-artifacts.json"), artifacts: report.artifacts, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
