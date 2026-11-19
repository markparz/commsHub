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

export async function GET() {
  try {
    const pull = await pullTeamStatusFromGit();
    let data = await readTeamStatus();
    const ensured = await ensureComputerDayStamp(data);
    let git = pull;

    if (ensured.added) {
      await writeTeamStatus(ensured.data);
      data = ensured.data;
      git = await syncTeamStatusToGit(
        "Add @computer daily status timestamp.",
      );
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
