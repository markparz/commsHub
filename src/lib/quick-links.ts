import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { getStatusRepoRoot } from "./team-status";

export type GlobalQuickLink = {
  id: string;
  label: string;
  url: string;
  addedBy?: string;
  createdAt: string;
};

export type QuickLinksFile = {
  links: GlobalQuickLink[];
};

const RELATIVE_PATH = path.join("data", "quick-links.json");

export function getQuickLinksFilePath() {
  return path.join(getStatusRepoRoot(), RELATIVE_PATH);
}

export async function readGlobalQuickLinks(): Promise<QuickLinksFile> {
  const filePath = getQuickLinksFilePath();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as QuickLinksFile;
    if (!parsed || !Array.isArray(parsed.links)) return { links: [] };
    return {
      links: parsed.links.filter(
        (link) =>
          link &&
          typeof link.id === "string" &&
          typeof link.label === "string" &&
          typeof link.url === "string",
      ),
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { links: [] };
    throw err;
  }
}

export async function writeGlobalQuickLinks(data: QuickLinksFile) {
  const filePath = getQuickLinksFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function addGlobalQuickLink(input: {
  label: string;
  url: string;
  addedBy?: string;
}): Promise<{ data: QuickLinksFile; link: GlobalQuickLink }> {
  const label = input.label.trim();
  const url = input.url.trim();
  if (!label) throw new Error("Label is required");
  if (!url) throw new Error("URL is required");

  const data = await readGlobalQuickLinks();
  const link: GlobalQuickLink = {
    id: randomUUID(),
    label,
    url,
    addedBy: input.addedBy?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  data.links = [link, ...data.links];
  await writeGlobalQuickLinks(data);
  return { data, link };
}

export async function removeGlobalQuickLink(
  id: string,
): Promise<QuickLinksFile> {
  const data = await readGlobalQuickLinks();
  const next = data.links.filter((link) => link.id !== id);
  if (next.length === data.links.length) {
    throw new Error("Link not found");
  }
  const updated = { links: next };
  await writeGlobalQuickLinks(updated);
  return updated;
}
