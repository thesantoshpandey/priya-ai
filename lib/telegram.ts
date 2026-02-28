const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// ============================================
// SEND MESSAGE
// ============================================

export async function sendTelegramMessage(chatId: string, text: string) {
  // Telegram has a 4096 character limit per message
  // Split long messages if needed
  const chunks = splitMessage(text, 4000);

  for (const chunk of chunks) {
    const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: "HTML",
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Telegram send error:", error);
      throw new Error(`Telegram API error: ${error.description}`);
    }

    // Small delay between chunks to maintain order
    if (chunks.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
}

// ============================================
// SEND TYPING INDICATOR
// ============================================

export async function sendTypingAction(chatId: string) {
  await fetch(`${TELEGRAM_API}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      action: "typing",
    }),
  });
}

// ============================================
// SET WEBHOOK
// ============================================

export async function setWebhook(url: string) {
  const response = await fetch(`${TELEGRAM_API}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message"],
      max_connections: 100,
    }),
  });

  return response.json();
}

// ============================================
// PARSE INCOMING UPDATE
// ============================================

export interface TelegramMessage {
  chatId: string;
  text: string;
  username?: string;
  firstName?: string;
  isCommand: boolean;
  command?: string;
}

export function parseTelegramUpdate(body: any): TelegramMessage | null {
  const message = body?.message;
  if (!message?.text) return null;

  const text = message.text.trim();
  const isCommand = text.startsWith("/");

  return {
    chatId: String(message.chat.id),
    text,
    username: message.from?.username,
    firstName: message.from?.first_name,
    isCommand,
    command: isCommand ? text.split(" ")[0].toLowerCase() : undefined,
  };
}

// ============================================
// HELPERS
// ============================================

function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a sentence boundary
    let splitPoint = remaining.lastIndexOf(". ", maxLength);
    if (splitPoint === -1 || splitPoint < maxLength * 0.5) {
      // Try newline
      splitPoint = remaining.lastIndexOf("\n", maxLength);
    }
    if (splitPoint === -1 || splitPoint < maxLength * 0.5) {
      // Try space
      splitPoint = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitPoint === -1) {
      splitPoint = maxLength;
    }

    chunks.push(remaining.substring(0, splitPoint + 1).trim());
    remaining = remaining.substring(splitPoint + 1).trim();
  }

  return chunks;
}

// Escape HTML special characters for Telegram HTML parse mode
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
