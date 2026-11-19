import { NextRequest, NextResponse } from "next/server";
import {
  pullTeamStatusFromGit,
  syncTeamStatusToGit,
} from "@/lib/status-git";
import {
  addStatusEntry,
  ensureComputerDayStamp,
  readTeamStatus,
  writeTeamStatus,
} from "@/lib/team-status";

export const dynamic = "force-dynamic";

function wantsGitSync(req: NextRequest) {
  const sync = req.nextUrl.searchParams.get("sync");
  // Interval polls use ?sync=0 to avoid hanging on git pull every minute
  if (sync === "0" || sync === "false") return false;
  return true;
}

export async function GET(req: NextRequest) {
  try {
    let git = {
      attempted: false,
      ok: true,
      message: "Skipped git pull (local read)",
    };

    if (wantsGitSync(req)) {
      git = await pullTeamStatusFromGit();
    }

    let data = await readTeamStatus();
    const ensured = await ensureComputerDayStamp(data);

    if (ensured.added) {
      await writeTeamStatus(ensured.data);
      data = ensured.data;
      if (wantsGitSync(req)) {
        git = await syncTeamStatusToGit(
          "Add @computer daily status timestamp.",
        );
      }
    }

    return NextResponse.json({
      entries: data.entries,
      git,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { author?: string; text?: string };
    const author =
      body.author?.trim() ||
      process.env.STATUS_AUTHOR?.trim() ||
      "anonymous";
    const text = body.text?.trim() || "";

    // Refresh from remote first so we don't clobber teammates
    await pullTeamStatusFromGit();

    const { data, entry, dayStampAdded } = await addStatusEntry({
      author,
      text,
    });

    const git = await syncTeamStatusToGit(
      dayStampAdded
        ? `Status: ${author} (+ @computer day stamp)`
        : `Status: ${author}`,
    );

    return NextResponse.json({
      entries: data.entries,
      entry,
      git,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to add status";
    const status = message.includes("required") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
