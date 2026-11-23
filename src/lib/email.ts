/** Wrap HTML email bodies for sandboxed iframe preview. */
export function emailSrcDoc(html: string): string {
  if (/<html[\s>]/i.test(html)) return html;
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><base target="_blank" /><style>body{margin:12px;font:14px/1.5 system-ui,sans-serif;color:#132019;word-wrap:break-word}img{max-width:100%;height:auto}a{color:#1f6f5b}</style></head><body>${html}</body></html>`;
}

/** Pull an address from `Name <email@x.com>` or a bare email string. */
export function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1].trim();
  return from.trim();
}

/** Split a To/Cc header into individual addresses. */
export function parseAddressList(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((part) => extractEmail(part))
    .filter(Boolean);
}

function uniqueEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const email of emails) {
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

export function replySubject(subject: string): string {
  const trimmed = subject.trim();
  if (/^re:/i.test(trimmed)) return trimmed;
  return `Re: ${trimmed}`;
}

export function forwardSubject(subject: string): string {
  const trimmed = subject.trim();
  if (/^(fwd|fw):/i.test(trimmed)) return trimmed;
  return `Fwd: ${trimmed}`;
}

/** Reply-all: From → To; other To/Cc → Cc (exclude self). */
export function replyAllRecipients(message: {
  from: string;
  to: string;
  cc?: string;
}): { to: string; cc: string } {
  const from = extractEmail(message.from);
  const others = uniqueEmails([
    ...parseAddressList(message.to),
    ...parseAddressList(message.cc),
  ]).filter((email) => email.toLowerCase() !== from.toLowerCase());

  return {
    to: from,
    cc: others.join(", "),
  };
}

export function quotedReplyBody(message: {
  date: string;
  from: string;
  snippet: string;
}): string {
  return `\n\n---\nOn ${message.date}, ${message.from} wrote:\n> ${message.snippet}`;
}

export function forwardedBody(message: {
  from: string;
  to: string;
  cc?: string;
  date: string;
  subject: string;
  snippet: string;
}): string {
  const lines = [
    "",
    "",
    "---------- Forwarded message ---------",
    `From: ${message.from}`,
    `Date: ${message.date}`,
    `Subject: ${message.subject}`,
    `To: ${message.to}`,
  ];
  if (message.cc) lines.push(`Cc: ${message.cc}`);
  lines.push("", message.snippet);
  return lines.join("\n");
}

/** Personal signature from EMAIL_SIGNATURE in .env.local (\n escapes allowed). */
export function getEmailSignature(): string {
  const raw = process.env.EMAIL_SIGNATURE || "";
  return raw.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
}

/**
 * Append the configured signature once, before quoted/forwarded content when present.
 */
export function withEmailSignature(body: string): string {
  const signature = getEmailSignature();
  if (!signature) return body;

  const normalizedBody = body.replace(/\r\n/g, "\n");
  if (normalizedBody.includes(signature)) return body;

  const quoteMatch = normalizedBody.match(
    /\n(?:---\nOn |---------- Forwarded message ---------)/,
  );
  if (quoteMatch && quoteMatch.index != null) {
    const before = normalizedBody.slice(0, quoteMatch.index).trimEnd();
    const after = normalizedBody.slice(quoteMatch.index);
    return `${before}\n\n${signature}${after}`;
  }

  return `${normalizedBody.trimEnd()}\n\n${signature}`;
}
