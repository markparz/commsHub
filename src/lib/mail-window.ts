/** Open a full email view in a dedicated browser window. */
export function openMailWindow(messageId: string) {
  if (!messageId || typeof window === "undefined") return;
  const url = `/mail/${encodeURIComponent(messageId)}`;
  window.open(
    url,
    `comms-hub-mail-${messageId}`,
    "noopener,noreferrer,width=980,height=820",
  );
}
