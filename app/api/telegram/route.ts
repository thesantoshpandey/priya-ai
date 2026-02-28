import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser, saveMessage, getRecentHistory, updateUserProfile, createOTPRecord, verifyOTP, hasPendingOTP, deleteUserData } from "@/lib/supabase";
import { generateResponse, detectUserInfo } from "@/lib/gemini";
import { parseTelegramUpdate, sendTelegramMessage, sendTypingAction } from "@/lib/telegram";
import { sendOTP, generateOTP, detectPhoneNumber } from "@/lib/twilio";

export const maxDuration = 30;

// ============================================
// TELEGRAM WEBHOOK HANDLER
// ============================================

export async function POST(request: NextRequest) {
  try {
    const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
    if (secretHeader !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const message = parseTelegramUpdate(body);

    if (!message) {
      return NextResponse.json({ ok: true });
    }

    if (message.isCommand) {
      await handleCommand(message.chatId, message.command!, message.firstName);
      return NextResponse.json({ ok: true });
    }

    await sendTypingAction(message.chatId);

    const user = await getOrCreateUser(message.chatId, message.username);

    // Detect and update user info
    const detectedInfo = detectUserInfo(message.text);
    if (Object.keys(detectedInfo).length > 0) {
      await updateUserProfile(user.id, detectedInfo);
      Object.assign(user, detectedInfo);
    }

    await saveMessage(user.id, "user", message.text);

    // ============================================
    // OTP FLOW — Check before AI response
    // ============================================

    // Check if user typed a 6-digit OTP code
    const otpMatch = message.text.match(/^\s*(\d{6})\s*$/);
    if (otpMatch && user.is_minor && !user.parental_consent) {
      const pendingOTP = await hasPendingOTP(user.id);
      if (pendingOTP) {
        const verified = await verifyOTP(user.id, otpMatch[1]);
        if (verified) {
          const successMsg =
            "Yayy! OTP verified ho gaya! 🎉 Ab tere parents ki permission mil gayi hai. " +
            "Chal ab properly padhai shuru karte hain. Bata kaunsa topic karein aaj?";
          await saveMessage(user.id, "assistant", successMsg);
          await sendTelegramMessage(message.chatId, successMsg);
          return NextResponse.json({ ok: true });
        } else {
          const failMsg =
            "Ye OTP galat hai ya expire ho gaya 😅 Apne parents se dubara code mangwa. " +
            "Agar 10 minute se zyada ho gaye toh bol, main nayi OTP bhej dungi!";
          await saveMessage(user.id, "assistant", failMsg);
          await sendTelegramMessage(message.chatId, failMsg);
          return NextResponse.json({ ok: true });
        }
      }
    }

    // Check if minor is providing parent's phone number
    if (user.is_minor && !user.parental_consent) {
      const phoneNumber = detectPhoneNumber(message.text);
      if (phoneNumber) {
        const otp = generateOTP();
        const sent = await sendOTP(phoneNumber, otp);

        if (sent) {
          await createOTPRecord(user.id, phoneNumber, otp);
          const otpSentMsg =
            "Done! Maine tere parents ko ek SMS bhej diya hai OTP ke saath 📱 " +
            "Unse code le aur yahan type kar de. 10 minute mein expire ho jayega!";
          await saveMessage(user.id, "assistant", otpSentMsg);
          await sendTelegramMessage(message.chatId, otpSentMsg);
        } else {
          const failMsg =
            "Arrey yaar, SMS nahi ja payi 😔 Number check karke dubara bhej. " +
            "Indian mobile number hona chahiye — jaise 9876543210";
          await saveMessage(user.id, "assistant", failMsg);
          await sendTelegramMessage(message.chatId, failMsg);
        }
        return NextResponse.json({ ok: true });
      }
    }

    // ============================================
    // NORMAL AI RESPONSE
    // ============================================

    const history = await getRecentHistory(user.id, 30);

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

    await saveMessage(user.id, "assistant", aiResponse, {
      tokens_used: tokensUsed,
      model_used: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
      response_time_ms: responseTime,
    });

    await sendTelegramMessage(message.chatId, aiResponse);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Webhook error:", error);
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

    case "/clearitall":
      // DPDPA 2023 — Right to erasure
      const user = await getOrCreateUser(chatId);
      await deleteUserData(user.id);
      await sendTelegramMessage(
        chatId,
        "Your data has been permanently deleted as per your request. " +
        "All chat history, profile information, and consent records have been removed. " +
        "If you message again, you'll start fresh as a new user.\n\n" +
        "Tera saara data delete ho gaya hai. Agar dubara message karegi/karega toh naye user ki tarah start hoga."
      );
      break;

    default:
      await sendTelegramMessage(
        chatId,
        "Yaar ye command samajh nahi aayi 😅 Bas normally message kar, main help karungi!"
      );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "Priya AI Telegram webhook is active",
    timestamp: new Date().toISOString(),
  });
}
