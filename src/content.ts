// On-page profile bar: a compact row of profile pictures in the bottom-left corner of the
// page (the least-used spot on most sites). One click switches. It lives in a closed shadow
// root, so page CSS can't touch it and it can't touch the page.
// Toggle with ⌥⇧P or the popup's "Profile bar on pages" switch.
import { avatar } from "./avatar";
import css from "./bar.css";
import { DOCK_HIDDEN, send, type State } from "./types";

const HOST_ID = "__profile-switcher-host";
const RELOAD_MS = 8000;

if (window.top === window && !document.getElementById(HOST_ID)) mount();

function mount(): void {
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "all: initial; position: fixed; z-index: 2147483647; bottom: 0; left: 0;";
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = css;
  const bar = document.createElement("div");
  bar.className = "bar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Switch Chrome profile");
  root.append(style, bar);

  let lastLoad = 0;
  let loading = false;

  async function load(force: boolean): Promise<void> {
    if (loading || (!force && Date.now() - lastLoad < RELOAD_MS)) return;
    loading = true;
    try {
      render(await send({ cmd: "state" }));
    } catch {
      render({ profiles: [], self: null, error: "Extension reloaded. Refresh this page." });
    } finally {
      loading = false;
      lastLoad = Date.now();
    }
  }

  function render(state: State): void {
    bar.replaceChildren();
    if (state.error && !state.profiles.length) {
      const msg = document.createElement("div");
      msg.className = "msg";
      msg.textContent = /not found|forbidden/i.test(state.error)
        ? "Profile helper not installed. Run install.sh."
        : state.error;
      bar.append(msg);
      return;
    }
    for (const p of state.profiles) {
      const isSelf = p.dir === state.self;
      const live = p.live && !isSelf;
      const b = document.createElement("button");
      const tip = p.name + (isSelf ? " · this profile" : live ? " · open" : "");
      b.dataset.tip = tip;
      b.setAttribute("aria-label", tip);
      if (isSelf) {
        b.classList.add("current");
        b.setAttribute("aria-current", "true");
      }
      b.append(avatar(p, 24));
      if (live) {
        const dot = document.createElement("span");
        dot.className = "dot";
        b.append(dot);
      }
      b.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isSelf) return;
        b.classList.add("busy");
        const r = await send({ cmd: "switch", dir: p.dir }).catch((err: unknown) => ({ error: String(err) }));
        b.classList.remove("busy");
        if ("error" in r) b.dataset.tip = `Error: ${r.error}`;
        lastLoad = 0;
      });
      bar.append(b);
    }
  }

  // Keep clicks on the bar from reaching the page underneath.
  for (const t of ["pointerdown", "mousedown", "mouseup", "click", "dblclick"]) {
    host.addEventListener(t, (e) => e.stopPropagation());
  }

  // Refresh the green "open" dots when you come back to the tab or hover the bar.
  bar.addEventListener("mouseenter", () => void load(false));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void load(false);
  });

  const applyHidden = (hidden: boolean) => {
    host.style.display = hidden ? "none" : "";
  };

  void chrome.storage.local.get<Record<string, boolean>>(DOCK_HIDDEN).then(({ [DOCK_HIDDEN]: hidden }) => {
    applyHidden(!!hidden);
    document.documentElement.append(host);
    void load(true);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    const change = changes[DOCK_HIDDEN];
    if (area === "local" && change) applyHidden(!!change.newValue);
  });
}
