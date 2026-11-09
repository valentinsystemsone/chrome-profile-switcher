// Keeps a native-messaging port open to the helper. While the port is open, Chrome keeps
// this service worker (and so this profile's "switch target") alive, so other profiles can
// bring this one to the front instantly.
import { DOCK_HIDDEN, type Profile, type Request, type State } from "./types";

const HOST = "com.valentin.profile_switcher";
const LIST_TTL_MS = 10_000;

/** Everything the helper can send back. Replies carry the request's `id`. */
interface HostMessage {
  id?: number;
  type?: "focus";
  error?: string;
  ok?: boolean;
  profiles?: Profile[];
  dirs?: string[];
}

type HostRequest =
  | { type: "list" }
  | { type: "switch"; profileDir: string }
  | { type: "hello"; profileDir: string }
  | { type: "identify"; email: string };

interface Pending {
  resolve: (m: HostMessage) => void;
  reject: (e: Error) => void;
}

let port: chrome.runtime.Port | null = null;
let hostError: string | null = null;
let selfDir: string | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
let listCache: { at: number; profiles: Profile[] } | null = null;

function connect(): chrome.runtime.Port | null {
  if (port) return port;
  try {
    port = chrome.runtime.connectNative(HOST);
  } catch (e) {
    hostError = errorMessage(e);
    return null;
  }
  hostError = null;
  port.onMessage.addListener(onHostMessage);
  port.onDisconnect.addListener(() => {
    hostError = chrome.runtime.lastError?.message ?? "Helper disconnected";
    port = null;
    for (const p of pending.values()) p.reject(new Error(hostError));
    pending.clear();
  });
  register().catch(() => {});
  return port;
}

function call(msg: HostRequest, timeoutMs = 5000): Promise<HostMessage> {
  const p = connect();
  if (!p) return Promise.reject(new Error(hostError ?? "Helper unavailable"));
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Helper timed out"));
    }, timeoutMs);
    pending.set(id, {
      resolve: (v) => (clearTimeout(timer), resolve(v)),
      reject: (e) => (clearTimeout(timer), reject(e)),
    });
    p.postMessage({ ...msg, id });
  });
}

function onHostMessage(msg: HostMessage): void {
  if (msg.type === "focus") {
    void focusSelf();
    return;
  }
  if (msg.id === undefined) return;
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  if (msg.error) p.reject(new Error(msg.error));
  else p.resolve(msg);
}

/**
 * Works out which profile directory this extension instance lives in.
 * Signed-in profiles are matched by email; otherwise the user picks once in the popup.
 */
async function register(): Promise<void> {
  let { selfDir: dir } = await chrome.storage.local.get<{ selfDir?: string }>("selfDir");
  if (!dir) {
    const info = await chrome.identity.getProfileUserInfo({ accountStatus: "ANY" }).catch(() => null);
    if (info?.email) {
      const r = await call({ type: "identify", email: info.email });
      if (r.dirs?.length === 1) {
        dir = r.dirs[0];
        await chrome.storage.local.set({ selfDir: dir });
      }
    }
  }
  selfDir = dir ?? null;
  if (selfDir) await call({ type: "hello", profileDir: selfDir });
}

async function focusSelf(): Promise<void> {
  const wins = await chrome.windows.getAll({ windowTypes: ["normal"] });
  if (!wins.length) {
    // Profile is still loaded but has no window open: make one.
    await chrome.windows.create({ focused: true });
    return;
  }
  const w = (await chrome.windows.getLastFocused({ windowTypes: ["normal"] }).catch(() => null)) ?? wins[0];
  if (w?.id === undefined) return;
  await chrome.windows.update(w.id, {
    focused: true,
    ...(w.state === "minimized" ? { state: "normal" } : {}),
  });
}

async function getState(fresh = false): Promise<State> {
  connect();
  if (!fresh && listCache && Date.now() - listCache.at < LIST_TTL_MS) {
    return { profiles: listCache.profiles, self: selfDir, error: null };
  }
  try {
    const { profiles = [] } = await call({ type: "list" });
    listCache = { at: Date.now(), profiles };
    return { profiles, self: selfDir, error: null };
  } catch (e) {
    return { profiles: [], self: selfDir, error: errorMessage(e) };
  }
}

async function switchTo(dir: string): Promise<{ ok: true }> {
  listCache = null;
  await call({ type: "switch", profileDir: dir });
  return { ok: true };
}

async function cycle(delta: number): Promise<void> {
  const { profiles } = await getState();
  if (!profiles.length) return;
  const i = profiles.findIndex((p) => p.dir === selfDir);
  const next = profiles[(i + delta + profiles.length) % profiles.length];
  if (next && next.dir !== selfDir) await switchTo(next.dir);
}

async function handle(req: Request): Promise<unknown> {
  switch (req.cmd) {
    case "state":
      return getState(req.fresh);
    case "switch":
      return switchTo(req.dir);
    case "setSelf":
      await chrome.storage.local.set({ selfDir: req.dir });
      selfDir = req.dir;
      listCache = null;
      await call({ type: "hello", profileDir: req.dir });
      return { ok: true };
  }
}

chrome.runtime.onMessage.addListener((req: Request, _sender, sendResponse) => {
  handle(req).then(sendResponse, (e: unknown) => sendResponse({ error: errorMessage(e) }));
  return true; // respond asynchronously
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-dock") {
    const { [DOCK_HIDDEN]: hidden } = await chrome.storage.local.get<Record<string, boolean>>(DOCK_HIDDEN);
    await chrome.storage.local.set({ [DOCK_HIDDEN]: !hidden });
  } else if (command === "next-profile") {
    cycle(1).catch(() => {});
  } else if (command === "prev-profile") {
    cycle(-1).catch(() => {});
  }
});

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
connect();
