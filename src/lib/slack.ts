import { WebClient } from "@slack/web-api";
import { getSession } from "./session";
import type { SlackChannel, SlackMessage } from "./types";

export function getSlackAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID || "",
    scope: "channels:history,channels:read,chat:write,groups:history,groups:read,im:history,im:read,mpim:history,users:read",
    user_scope: "",
    redirect_uri:
      process.env.SLACK_REDIRECT_URI ||
      `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/slack/callback`,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

export async function getSlackClient() {
  const session = await getSession();
  if (!session.slackAccessToken) return null;
  return new WebClient(session.slackAccessToken);
}

export async function listSlackChannels(): Promise<SlackChannel[]> {
  const client = await getSlackClient();
  if (!client) throw new Error("Slack not connected");

  const res = await client.conversations.list({
    types: "public_channel,private_channel",
    exclude_archived: true,
    limit: 100,
  });

  return (res.channels || [])
    .filter((c) => c.id && c.name)
    .map((c) => ({ id: c.id!, name: c.name! }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listSlackMessages(
  channelId: string,
  limit = 40,
): Promise<SlackMessage[]> {
  const client = await getSlackClient();
  if (!client) throw new Error("Slack not connected");

  const [history, users] = await Promise.all([
    client.conversations.history({ channel: channelId, limit }),
    client.users.list({}),
  ]);

  const nameById = new Map<string, string>();
  for (const u of users.members || []) {
    if (u.id) nameById.set(u.id, u.real_name || u.name || u.id);
  }

  return (history.messages || [])
    .filter((m) => m.ts && m.text)
    .map((m) => ({
      id: m.ts!,
      user: nameById.get(m.user || "") || m.username || m.user || "Unknown",
      text: m.text || "",
      ts: new Date(Number(m.ts!) * 1000).toISOString(),
      channelId,
    }))
    .reverse();
}

export async function sendSlackMessage(channelId: string, text: string) {
  const client = await getSlackClient();
  if (!client) throw new Error("Slack not connected");
  await client.chat.postMessage({ channel: channelId, text });
}
