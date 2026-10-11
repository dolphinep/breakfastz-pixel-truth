import { siGithub, siInstagram, siTiktok, siYoutube } from "simple-icons";

/** Who made this and where to find them — shown in the footer and the About dialog. */
export const SITE = {
  brand: "breakfastz",
  url: "https://pixeltruth.breakfastz.dev",
  episode: "EP.001",
  github: { icon: siGithub, user: "dolphinep", profile: "https://github.com/dolphinep", repo: "https://github.com/dolphinep/breakfastz-pixel-truth" },
  channels: [
    { name: "YouTube", handle: "@breakfastz", url: "https://www.youtube.com/@breakfastz", icon: siYoutube },
    { name: "TikTok", handle: "@breakfastz_official", url: "https://www.tiktok.com/@breakfastz_official", icon: siTiktok },
    { name: "Instagram", handle: "@breakfastz.th", url: "https://www.instagram.com/breakfastz.th/", icon: siInstagram },
  ],
} as const;
