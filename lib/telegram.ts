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
// GET FILE URL (for images)
// ============================================

export async function getFileUrl(fileId: string): Promise<string | null> {
  try {
    const res = await fetch(`${TELEGRAM_API}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });
    const data = await res.json();
    if (data.ok && data.result?.file_path) {
      return `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
    }
    return null;
  } catch {
    return null;
  }
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
  hasPhoto: boolean;
  photoFileId?: string;
  hasVoice: boolean;
  voiceFileId?: string;
}

export function parseTelegramUpdate(body: any): TelegramMessage | null {
  const message = body?.message;
  if (!message) return null;

  // Handle photo messages
  if (message.photo && message.photo.length > 0) {
    const bestPhoto = message.photo[message.photo.length - 1];
    const caption = message.caption || "";
    return {
      chatId: String(message.chat.id),
      text: caption || "[photo]",
      username: message.from?.username,
      firstName: message.from?.first_name,
      isCommand: false,
      hasPhoto: true,
      photoFileId: bestPhoto.file_id,
      hasVoice: false,
    };
  }

  // Handle voice messages
  if (message.voice || message.audio) {
    const fileId = message.voice?.file_id || message.audio?.file_id;
    return {
      chatId: String(message.chat.id),
      text: "[voice_message]",
      username: message.from?.username,
      firstName: message.from?.first_name,
      isCommand: false,
      hasPhoto: false,
      hasVoice: true,
      voiceFileId: fileId,
    };
  }

  if (!message.text) return null;

  const text = message.text.trim();
  const isCommand = text.startsWith("/");

  return {
    chatId: String(message.chat.id),
    text,
    username: message.from?.username,
    firstName: message.from?.first_name,
    isCommand,
    command: isCommand ? text.split(" ")[0].toLowerCase() : undefined,
    hasPhoto: false,
    hasVoice: false,
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

// ============================================
// SEND VOICE NOTE via Telegram
// ============================================

export async function sendVoiceNote(chatId: string, audioBuffer: Buffer) {
  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append("voice", new Blob([new Uint8Array(audioBuffer)], { type: "audio/ogg" }), "voice.ogg");

  const response = await fetch(`${TELEGRAM_API}/sendVoice`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    console.error("Telegram voice send error:", error);
    // Fallback: try as audio file
    const audioForm = new FormData();
    audioForm.append("chat_id", chatId);
    audioForm.append("audio", new Blob([new Uint8Array(audioBuffer)], { type: "audio/mp3" }), "priya.mp3");
    await fetch(`${TELEGRAM_API}/sendAudio`, {
      method: "POST",
      body: audioForm,
    });
  }
}

// ============================================
// GENERATE VOICE via Cartesia
// ============================================

export async function generateVoice(text: string, preferredLanguage?: string): Promise<Buffer | null> {
  if (!process.env.CARTESIA_API_KEY) return null;

  try {
    // Truncate very long texts for voice (keep voice under 30 seconds)
    const voiceText = text.length > 500 ? text.substring(0, 500) + "..." : text;

    // Map preferred_language to Cartesia language codes
    const langMap: Record<string, string> = {
      hindi: "hi",
      hinglish: "hi",
      tamil: "ta",
      kannada: "kn",
      telugu: "te",
      malayalam: "ml",
      bengali: "bn",
      marathi: "mr",
      gujarati: "gu",
      punjabi: "pa",
      urdu: "ur",
      english: "en",
      odia: "or",
      assamese: "as",
    };
    const cartesiaLang = langMap[preferredLanguage || "hinglish"] || "hi";

    const response = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        "X-API-Key": process.env.CARTESIA_API_KEY,
        "Cartesia-Version": "2024-06-10",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_id: "sonic-2",
        transcript: voiceText,
        voice: {
          mode: "id",
          id: process.env.CARTESIA_VOICE_ID || "bef6b65a-abe0-4298-957f-3e41954dfb1c",
        },
        output_format: {
          container: "mp3",
          bit_rate: 128000,
          sample_rate: 44100,
        },
        language: cartesiaLang,
      }),
    });

    if (response.ok) {
      const buffer = await response.arrayBuffer();
      return Buffer.from(buffer);
    } else {
      console.error("Cartesia error:", await response.text());
      return null;
    }
  } catch (err) {
    console.error("Cartesia TTS error:", err);
    return null;
  }
}

// ============================================
// GET VOICE FILE from Telegram (for transcription)
// ============================================

export async function getVoiceFileUrl(fileId: string): Promise<string | null> {
  return getFileUrl(fileId);
}
