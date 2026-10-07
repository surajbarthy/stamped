// Font switch: Comic Sans by default, a plain system font for anyone who
// finds it hard to read. The choice is remembered on this browser.
(() => {
  const KEY = "slopstamp:font";
  const root = document.documentElement;

  function read() {
    try {
      return localStorage.getItem(KEY) === "plain" ? "plain" : "comic";
    } catch {
      return "comic";
    }
  }

  function apply(font) {
    if (font === "plain") root.dataset.font = "plain";
    else delete root.dataset.font;
    for (const button of document.querySelectorAll("[data-font-toggle]")) {
      button.setAttribute("aria-pressed", String(font === "plain"));
      button.title = font === "plain" ? "Switch back to Comic Sans" : "Switch to a plain font";
    }
  }

  // Runs in <head>, before the page paints, so there is no flash of the other font.
  apply(read());

  document.addEventListener("DOMContentLoaded", () => {
    apply(read());
    for (const button of document.querySelectorAll("[data-font-toggle]")) {
      button.addEventListener("click", () => {
        const next = root.dataset.font === "plain" ? "comic" : "plain";
        try {
          localStorage.setItem(KEY, next);
        } catch {
          // Storage can be blocked; the switch still works for this page.
        }
        apply(next);
      });
    }
  });
})();
