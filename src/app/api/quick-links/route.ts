import { NextRequest, NextResponse } from "next/server";
import {
  pullTeamStatusFromGit,
  syncPathsToGit,
} from "@/lib/status-git";
import {
  addGlobalQuickLink,
  readGlobalQuickLinks,
  removeGlobalQuickLink,
} from "@/lib/quick-links";

export const dynamic = "force-dynamic";

const LINKS_PATH = "data/quick-links.json";

export async function GET(req: NextRequest) {
  try {
    const sync = req.nextUrl.searchParams.get("sync");
    let git = {
      attempted: false,
      ok: true,
      message: "Skipped git pull (local read)",
    };
    if (sync !== "0" && sync !== "false") {
      git = await pullTeamStatusFromGit();
    }
    const data = await readGlobalQuickLinks();
    return NextResponse.json({ links: data.links, git });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load quick links";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      label?: string;
      url?: string;
      addedBy?: string;
    };
    await pullTeamStatusFromGit();
    const { data, link } = await addGlobalQuickLink({
      label: body.label?.trim() || "",
      url: body.url?.trim() || "",
      addedBy: body.addedBy?.trim(),
    });
    const git = await syncPathsToGit(
      [LINKS_PATH],
      `Quick link: add ${link.label}`,
    );
    return NextResponse.json({ links: data.links, link, git });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to add quick link";
    const status =
      message.includes("required") || message.includes("URL") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    await pullTeamStatusFromGit();
    const data = await removeGlobalQuickLink(id);
    const git = await syncPathsToGit(
      [LINKS_PATH],
      "Quick link: remove shared link",
    );
    return NextResponse.json({ links: data.links, git });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to remove quick link";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
