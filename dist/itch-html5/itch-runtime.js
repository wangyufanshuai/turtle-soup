(() => {
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
})();