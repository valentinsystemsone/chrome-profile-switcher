import type { Profile } from "./types";

/** A round profile picture, or the profile's initial on its theme colour. */
export function avatar(profile: Profile, size: number): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = "avatar";
  el.style.width = el.style.height = `${size}px`;
  if (profile.avatar) {
    const img = document.createElement("img");
    img.src = profile.avatar;
    img.alt = "";
    el.append(img);
  } else {
    el.textContent = (profile.name.trim()[0] ?? "?").toUpperCase();
    el.style.background = profile.color ?? "#5f6368";
    el.style.fontSize = `${Math.round(size * 0.45)}px`;
  }
  return el;
}

export function label(profile: Profile): string {
  return profile.email ? `${profile.name} · ${profile.email}` : profile.name;
}
