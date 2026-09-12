import crypto from "node:crypto";

const baseUrl = process.env.MUSIC_ASSISTANT_URL;
const token = process.env.MUSIC_ASSISTANT_TOKEN;

if (!baseUrl) {
  throw new Error("MUSIC_ASSISTANT_URL is not configured");
}

if (!token) {
  throw new Error("MUSIC_ASSISTANT_TOKEN is not configured");
}

export async function maCommand(
  command: string,
  args: Record<string, unknown> = {}
) {
  const response = await fetch(`${baseUrl}/api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      message_id: crypto.randomUUID(),
      command,
      args,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Music Assistant returned ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}
