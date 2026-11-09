/** A Chrome profile, as read by the native helper from Chrome's `Local State`. */
export interface Profile {
  /** Profile directory name, e.g. "Default" or "Profile 3". */
  dir: string;
  name: string;
  email: string;
  /** Account picture as a data: URL, if the profile has one. */
  avatar: string | null;
  /** Profile theme colour as CSS hex, used behind the initial when there's no picture. */
  color: string | null;
  /** The profile's helper is running, so switching to it is instant. */
  live: boolean;
}

export interface State {
  profiles: Profile[];
  /** This extension instance's own profile directory, once known. */
  self: string | null;
  error: string | null;
}

/** Messages from the popup and content script to the background service worker. */
export type Request =
  | { cmd: "state"; fresh?: boolean }
  | { cmd: "switch"; dir: string }
  | { cmd: "setSelf"; dir: string };

export type Result = { ok: true } | { error: string };

export type Response<R extends Request> = R extends { cmd: "state" } ? State : Result;

/** Typed wrapper around chrome.runtime.sendMessage. */
export function send<R extends Request>(req: R): Promise<Response<R>> {
  return chrome.runtime.sendMessage<R, Response<R>>(req);
}

export const DOCK_HIDDEN = "dockHidden";
