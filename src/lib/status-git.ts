import { execFile } from "child_process";
import { promisify } from "util";
import { getStatusRepoRoot } from "./team-status";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 12_000;

function gitSyncEnabled() {
  const raw = process.env.STATUS_GIT_SYNC?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "off") return false;
  return true;
}

function gitToken() {
  return (
    process.env.STATUS_GIT_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    ""
  );
}

function scrub(message: string) {
  return message.replace(/x-access-token:[^@\s]+@/g, "x-access-token:***@");
}

async function runGit(args: string[], root: string) {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd: root,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
    maxBuffer: 2 * 1024 * 1024,
    timeout: GIT_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

/** Use tokenized HTTPS remote for pull/push when a token is available. */
async function remoteArgs(root: string): Promise<string[]> {
  const token = gitToken();
  if (!token) return ["origin"];
  try {
    const { stdout } = await runGit(["remote", "get-url", "origin"], root);
    const url = stdout.trim();
    const match = url.match(/github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/i);
    if (!match) return ["origin"];
    const repo = match[1].replace(/\.git$/i, "");
    return [`https://x-access-token:${token}@github.com/${repo}.git`];
  } catch {
    return ["origin"];
  }
}

export type StatusGitResult = {
  attempted: boolean;
  ok: boolean;
  message: string;
};

/** Pull latest, commit status file changes, and push to origin. */
export async function syncTeamStatusToGit(
  commitMessage: string,
): Promise<StatusGitResult> {
  if (!gitSyncEnabled()) {
    return {
      attempted: false,
      ok: true,
      message: "Git sync disabled (STATUS_GIT_SYNC=false)",
    };
  }

  const root = getStatusRepoRoot();

  try {
    await runGit(["rev-parse", "--is-inside-work-tree"], root);
  } catch {
    return {
      attempted: true,
      ok: false,
      message: `Not a git repo at ${root}. Set STATUS_REPO_ROOT to the checkout.`,
    };
  }

  try {
    const remote = await remoteArgs(root);
    try {
      await runGit(["pull", "--ff-only", ...remote, "main"], root);
    } catch (pullErr) {
      const msg =
        pullErr instanceof Error ? pullErr.message : "git pull failed";
      console.warn("[status-git] pull:", scrub(msg));
    }

    await runGit(["add", "data/team-status.json"], root);
    const { stdout: staged } = await runGit(
      ["diff", "--cached", "--name-only"],
      root,
    );
    if (!staged) {
      return {
        attempted: true,
        ok: true,
        message: "No status file changes to commit",
      };
    }

    const authorName =
      process.env.STATUS_GIT_AUTHOR_NAME?.trim() || "Comms Hub";
    const authorEmail =
      process.env.STATUS_GIT_AUTHOR_EMAIL?.trim() || "comms-hub@localhost";
    await runGit(
      [
        "-c",
        `user.name=${authorName}`,
        "-c",
        `user.email=${authorEmail}`,
        "commit",
        "-m",
        commitMessage,
      ],
      root,
    );

    await runGit(["push", ...remote, "main"], root);
    return {
      attempted: true,
      ok: true,
      message: "Committed and pushed status update",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Git sync failed";
    const scrubbed = scrub(message);
    console.error("[status-git]", scrubbed);
    return { attempted: true, ok: false, message: scrubbed };
  }
}

export async function pullTeamStatusFromGit(): Promise<StatusGitResult> {
  if (!gitSyncEnabled()) {
    return {
      attempted: false,
      ok: true,
      message: "Git sync disabled",
    };
  }

  const root = getStatusRepoRoot();
  try {
    await runGit(["rev-parse", "--is-inside-work-tree"], root);
    const remote = await remoteArgs(root);
    await runGit(["pull", "--ff-only", ...remote, "main"], root);
    return {
      attempted: true,
      ok: true,
      message: "Pulled latest status",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "git pull failed";
    return { attempted: true, ok: false, message: scrub(message) };
  }
}
