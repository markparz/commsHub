import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export type SessionData = {
  googleAccessToken?: string;
  googleRefreshToken?: string;
  googleExpiry?: number;
  slackAccessToken?: string;
  slackTeamName?: string;
  slackUserId?: string;
  oauthState?: string;
};

export const sessionOptions: SessionOptions = {
  password:
    process.env.SESSION_SECRET ||
    "comms-hub-dev-secret-change-me-please-32chars",
  cookieName: "comms_hub_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export function isDemoMode() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return true;
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "false") return false;
  const hasGoogle =
    Boolean(process.env.GOOGLE_CLIENT_ID) &&
    Boolean(process.env.GOOGLE_CLIENT_SECRET);
  const hasSlack =
    Boolean(process.env.SLACK_CLIENT_ID) &&
    Boolean(process.env.SLACK_CLIENT_SECRET);
  return !hasGoogle && !hasSlack;
}
