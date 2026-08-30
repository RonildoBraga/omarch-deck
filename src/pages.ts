import type { IconName } from "./icons.js";

export type PageName = "main" | "development";

export interface DeckKey {
  label: string;
  icon: IconName;
  action?: string;
  page?: PageName;
  color: string;
  iconColor?: string;
  holdMs?: number;
}

// Black tiles with red outline icons. Page navigation gets a brighter icon so
// it stands out, destructive keys a darker one.
export const THEME = {
  tile: "#000000",
  nav: "#000000",
  danger: "#000000",
  strip: "#000000",
  text: "#e0b0b0",
  icon: "#c81e1e",
  navIcon: "#ff4d4d",
  dangerIcon: "#7a0000",
  screenBg: "#000000",
  accent: "#ff4d4d",
  muted: "#a06060",
} as const;

export const PAGES: Record<PageName, DeckKey[]> = {
  main: [
    { label: "Terminal", icon: "terminal", action: "terminal", color: THEME.tile },
    { label: "VS Code", icon: "code", action: "editor", color: THEME.tile },
    { label: "Chrome", icon: "browser", action: "browser", color: THEME.tile },
    { label: "Files", icon: "files", action: "files", color: THEME.tile },
    { label: "Lazygit", icon: "git", action: "lazygit", color: THEME.tile },
    { label: "Docker", icon: "docker", action: "docker", color: THEME.tile },
    { label: "btop", icon: "processes", action: "processes", color: THEME.tile },
    { label: "Develop", icon: "wrench", page: "development", color: THEME.nav, iconColor: THEME.navIcon },
    { label: "Clipboard", icon: "clipboard", action: "clipboard", color: THEME.tile },
    { label: "Screenshot", icon: "camera", action: "screenshot", color: THEME.tile },
    { label: "1Password", icon: "key", action: "passwords", color: THEME.tile },
    { label: "Hold Lock", icon: "lock", action: "lock-screen", color: THEME.danger, iconColor: THEME.dangerIcon, holdMs: 1_200 },
  ],
  development: [
    { label: "Build", icon: "hammer", action: "project:build", color: THEME.tile },
    { label: "Test", icon: "check", action: "project:test", color: THEME.tile },
    { label: "Check", icon: "search", action: "project:check", color: THEME.tile },
    { label: "Verify", icon: "check", action: "project:verify", color: THEME.tile },
    { label: "Lazygit", icon: "git", action: "lazygit", color: THEME.tile },
    { label: "Git Status", icon: "git", action: "git-status", color: THEME.tile },
    { label: "Docker", icon: "docker", action: "docker", color: THEME.tile },
    { label: "btop", icon: "processes", action: "processes", color: THEME.tile },
    { label: "Terminal", icon: "terminal", action: "terminal", color: THEME.tile },
    { label: "VS Code", icon: "code", action: "editor", color: THEME.tile },
    { label: "Main", icon: "back", page: "main", color: THEME.nav, iconColor: THEME.navIcon },
    { label: "Hold Lock", icon: "lock", action: "lock-screen", color: THEME.danger, iconColor: THEME.dangerIcon, holdMs: 1_200 },
  ],
};
