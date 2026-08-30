import { execFile } from "node:child_process";
import { promisify } from "node:util";

const runFile = promisify(execFile);

interface WorkspaceInfo { id: number; windows: number }
interface ActiveWindow { class: string }

export interface DesktopState {
  activeWorkspace: number;
  occupiedWorkspaces: Set<number>;
  app: string;
  branch: string;
}

async function jsonCommand<T>(command: string, args: string[]): Promise<T> {
  const { stdout } = await runFile(command, args, { timeout: 2_000 });
  return JSON.parse(stdout) as T;
}

async function gitBranch(projectPath: string): Promise<string> {
  try {
    const { stdout } = await runFile("git", ["branch", "--show-current"], { cwd: projectPath, timeout: 2_000 });
    return stdout.trim() || "detached";
  } catch { return "no git"; }
}

export async function readDesktopState(projectPath: string): Promise<DesktopState> {
  const [workspace, workspaces, window, branch] = await Promise.all([
    jsonCommand<WorkspaceInfo>("hyprctl", ["-j", "activeworkspace"]),
    jsonCommand<WorkspaceInfo[]>("hyprctl", ["-j", "workspaces"]),
    jsonCommand<ActiveWindow>("hyprctl", ["-j", "activewindow"]),
    gitBranch(projectPath),
  ]);
  return {
    activeWorkspace: workspace.id,
    occupiedWorkspaces: new Set(workspaces.filter(item => item.windows > 0).map(item => item.id)),
    app: window.class || "Desktop",
    branch,
  };
}
