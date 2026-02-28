import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser, saveMessage, getRecentHistory, updateUserProfile } from "@/lib/supabase";
import { generateResponse, detectUserInfo } from "@/lib/gemini";
import { parseTelegramUpdate, sendTelegramMessage, sendTypingAction } from "@/lib/telegram";

export const maxDuration = 30; // Vercel function timeout

// ============================================
// TELEGRAM WEBHOOK HANDLER
// ============================================

export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret (security)
    const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
    if (secretHeader !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const message = parseTelegramUpdate(body);

    // Ignore non-text messages (stickers, images, etc.)
    if (!message) {
      return NextResponse.json({ ok: true });
    }

    // Handle commands
    if (message.isCommand) {
      await handleCommand(message.chatId, message.command!, message.firstName);
      return NextResponse.json({ ok: true });
    }

    // Show typing indicator immediately
    await sendTypingAction(message.chatId);

    // Get or create user in database
    const user = await getOrCreateUser(message.chatId, message.username);

    // Detect and update user info from message content
    const detectedInfo = detectUserInfo(message.text);
    if (Object.keys(detectedInfo).length > 0) {
      await updateUserProfile(user.id, detectedInfo);
      // Merge detected info into user context
      Object.assign(user, detectedInfo);
    }

    // Save user's message to database
    await saveMessage(user.id, "user", message.text);

    // Get chat history for context
    const history = await getRecentHistory(user.id, 30);

    // Generate AI response
    const startTime = Date.now();
    const { text: aiResponse, tokensUsed } = await generateResponse(
      message.text,
      history,
      {
        name: user.name,
        class: user.class,
        neet_year: user.neet_year,
        is_minor: user.is_minor,
        parental_consent: user.parental_consent,
        message_count: user.message_count,
        weak_subjects: user.weak_subjects,
      }
    );
    const responseTime = Date.now() - startTime;

    // Save AI response to database
    await saveMessage(user.id, "assistant", aiResponse, {
      tokens_used: tokensUsed,
      model_used: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
      response_time_ms: responseTime,
    });

    // Send response to Telegram
    await sendTelegramMessage(message.chatId, aiResponse);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Webhook error:", error);
    // Don't crash — Telegram will retry if we return 500
    return NextResponse.json({ ok: true });
  }
}

// ============================================
// COMMAND HANDLERS
// ============================================

async function handleCommand(chatId: string, command: string, firstName?: string) {
  switch (command) {
    case "/start":
      const welcomeMsg = firstName
        ? `Hey ${firstName}! 😊 Main Priya hoon — teri NEET prep mein help karungi. Pehle bata, tera naam kya hai aur tu kis class mein hai?`
        : `Hey! 😊 Main Priya hoon — teri NEET prep mein help karungi. Pehle bata, tera naam kya hai aur tu kis class mein hai?`;
      
      // Create user on /start
      await getOrCreateUser(chatId);
      await sendTelegramMessage(chatId, welcomeMsg);
      break;

    case "/help":
      await sendTelegramMessage(
        chatId,
        "Main teri NEET preparation mein help kar sakti hoon 📚\n\n" +
        "Biology, Chemistry, Physics — kuch bhi puch! Concept explain karungi, " +
        "mnemonics bataungi, aur practice questions bhi dungi.\n\n" +
        "Bas message kar aur shuru ho ja! 💪"
      );
      break;

    case "/reset":
      await sendTelegramMessage(
        chatId,
        "Accha chal, fresh start karte hain! Bata kya padhna hai aaj? 🧬"
      );
      break;

    default:
      await sendTelegramMessage(
        chatId,
        "Yaar ye command samajh nahi aayi 😅 Bas normally message kar, main help karungi!"
      );
  }
}

// ============================================
// WEBHOOK VERIFICATION (GET)
// ============================================

export async function GET() {
  return NextResponse.json({
    status: "Priya AI Telegram webhook is active",
    timestamp: new Date().toISOString(),
  });
}
