import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

export type StatusEntry = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
};

export type TeamStatusFile = {
  entries: StatusEntry[];
};

const RELATIVE_PATH = path.join("data", "team-status.json");

export function getStatusRepoRoot() {
  return (
    process.env.STATUS_REPO_ROOT?.trim() ||
    process.env.PWD ||
    process.cwd()
  );
}

export function getStatusFilePath() {
  return path.join(getStatusRepoRoot(), RELATIVE_PATH);
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function todayKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDayLabel(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function readTeamStatus(): Promise<TeamStatusFile> {
  const filePath = getStatusFilePath();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as TeamStatusFile;
    if (!parsed || !Array.isArray(parsed.entries)) {
      return { entries: [] };
    }
    return {
      entries: parsed.entries.filter(
        (e) =>
          e &&
          typeof e.id === "string" &&
          typeof e.author === "string" &&
          typeof e.text === "string" &&
          typeof e.createdAt === "string",
      ),
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { entries: [] };
    throw err;
  }
}

export async function writeTeamStatus(data: TeamStatusFile) {
  const filePath = getStatusFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(filePath, payload, "utf8");
}

/** Ensures a daily @computer timestamp exists for today. Returns true if added. */
export async function ensureComputerDayStamp(
  data: TeamStatusFile,
  now = new Date(),
): Promise<{ data: TeamStatusFile; added: boolean }> {
  const today = todayKey(now);
  const hasToday = data.entries.some(
    (e) =>
      e.author.toLowerCase() === "@computer" && dayKey(e.createdAt) === today,
  );
  if (hasToday) return { data, added: false };

  const stamp: StatusEntry = {
    id: randomUUID(),
    author: "@computer",
    text: `Daily status — ${formatDayLabel(today)}`,
    createdAt: now.toISOString(),
  };

  return {
    data: { entries: [stamp, ...data.entries] },
    added: true,
  };
}

export async function addStatusEntry(input: {
  author: string;
  text: string;
}): Promise<{ data: TeamStatusFile; entry: StatusEntry; dayStampAdded: boolean }> {
  const author = input.author.trim() || "anonymous";
  const text = input.text.trim();
  if (!text) throw new Error("Status text is required");
  if (text.length > 2000) throw new Error("Status text is too long");

  let data = await readTeamStatus();
  const ensured = await ensureComputerDayStamp(data);
  data = ensured.data;

  const entry: StatusEntry = {
    id: randomUUID(),
    author: author.startsWith("@") ? author : author,
    text,
    createdAt: new Date().toISOString(),
  };

  data = { entries: [entry, ...data.entries] };
  await writeTeamStatus(data);
  return { data, entry, dayStampAdded: ensured.added };
}
