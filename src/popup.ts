import { avatar } from "./avatar";
import { DOCK_HIDDEN, send, type Profile, type State } from "./types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const listEl = $<HTMLUListElement>("list");
const errEl = $<HTMLDivElement>("error");
const selfEl = $<HTMLSelectElement>("self");
const dockEl = $<HTMLInputElement>("dock");

async function load(): Promise<void> {
  render(await send({ cmd: "state", fresh: true }));
}

function showError(message: string, html = false): void {
  errEl.hidden = false;
  if (html) errEl.innerHTML = message;
  else errEl.textContent = message;
}

function render(state: State): void {
  errEl.hidden = true;
  if (state.error && !state.profiles.length) {
    if (/not found|forbidden/i.test(state.error)) {
      showError("The helper isn't installed. Run <code>./install.sh</code>, then reload this extension.", true);
    } else {
      showError(state.error);
    }
  }

  listEl.replaceChildren(...state.profiles.map((p) => row(p, p.dir === state.self)));

  selfEl.length = 1;
  for (const p of state.profiles) selfEl.add(new Option(p.name, p.dir));
  selfEl.value = state.self ?? "";
}

function row(p: Profile, isSelf: boolean): HTMLLIElement {
  const li = document.createElement("li");
  const item = document.createElement("button");
  item.className = "item" + (isSelf ? " current" : "");
  if (isSelf) item.setAttribute("aria-current", "true");

  const text = document.createElement("span");
  text.className = "text";
  const headline = document.createElement("span");
  headline.className = "headline";
  headline.textContent = p.name;
  const supporting = document.createElement("span");
  supporting.className = "supporting";
  supporting.textContent = p.email || p.dir;
  text.append(headline, supporting);
  item.append(avatar(p, 40), text);

  if (isSelf || p.live) {
    const trailing = document.createElement("span");
    trailing.className = "trailing";
    if (isSelf) {
      trailing.textContent = "Current";
    } else {
      const dot = document.createElement("span");
      dot.className = "dot";
      trailing.append(dot, "Open");
      trailing.title = "Already open: switches instantly";
    }
    item.append(trailing);
  }

  item.addEventListener("click", async () => {
    if (isSelf) return window.close();
    item.classList.add("busy");
    const r = await send({ cmd: "switch", dir: p.dir });
    if ("error" in r) {
      item.classList.remove("busy");
      showError(r.error);
    } else {
      window.close();
    }
  });

  li.append(item);
  return li;
}

selfEl.addEventListener("change", async () => {
  if (!selfEl.value) return;
  await send({ cmd: "setSelf", dir: selfEl.value });
  await load();
});

void chrome.storage.local.get<Record<string, boolean>>(DOCK_HIDDEN).then(({ [DOCK_HIDDEN]: hidden }) => {
  dockEl.checked = !hidden;
});
dockEl.addEventListener("change", () => void chrome.storage.local.set({ [DOCK_HIDDEN]: !dockEl.checked }));

void load();
