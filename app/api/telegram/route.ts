import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser, saveMessage, getRecentHistory, updateUserProfile, createOTPRecord, verifyOTP, hasPendingOTP, deleteUserData } from "@/lib/supabase";
import { generateResponse, detectUserInfo } from "@/lib/gemini";
import { parseTelegramUpdate, sendTelegramMessage, sendTypingAction, getFileUrl } from "@/lib/telegram";
import { sendOTP, generateOTP, detectPhoneNumber } from "@/lib/twilio";

export const maxDuration = 30;

// ============================================
// SIMPLE RATE LIMITER (per user, in-memory)
// ============================================

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_PER_MINUTE = 10;
const RATE_LIMIT_PER_DAY = 200;
const dailyLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(chatId: string): { allowed: boolean; reason?: string } {
  const now = Date.now();

  const minuteData = rateLimitMap.get(chatId);
  if (minuteData && now < minuteData.resetAt) {
    if (minuteData.count >= RATE_LIMIT_PER_MINUTE) {
      return { allowed: false, reason: "minute" };
    }
    minuteData.count++;
  } else {
    rateLimitMap.set(chatId, { count: 1, resetAt: now + 60000 });
  }

  const dayData = dailyLimitMap.get(chatId);
  if (dayData && now < dayData.resetAt) {
    if (dayData.count >= RATE_LIMIT_PER_DAY) {
      return { allowed: false, reason: "daily" };
    }
    dayData.count++;
  } else {
    dailyLimitMap.set(chatId, { count: 1, resetAt: now + 86400000 });
  }

  return { allowed: true };
}

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

    // Rate limiting
    const rateCheck = checkRateLimit(message.chatId);
    if (!rateCheck.allowed) {
      if (rateCheck.reason === "daily") {
        await sendTelegramMessage(
          message.chatId,
          "Bachhe, aaj ke liye bahut padhai ho gayi! 😴 Thoda rest karo, kal milte hain fresh mind ke saath. Remember — rest bhi preparation ka part hai! 💪"
        );
      } else {
        await sendTelegramMessage(
          message.chatId,
          "Arrey thoda slow yaar! Itne saare messages ek saath? 😅 Ek ek karke bolo, main sab answer karungi!"
        );
      }
      return NextResponse.json({ ok: true });
    }

    // Handle voice messages
    if (message.text === "[voice_message]") {
      await sendTelegramMessage(
        message.chatId,
        "Voice notes ka feature bahut jaldi aa raha hai! 🎙️ Abhi ke liye text mein type kardo apna doubt, main solve kar dungi. Jaldi aap mujhse voice pe bhi baat kar paoge — stay tuned! 🔥"
      );
      return NextResponse.json({ ok: true });
    }

    // Handle photo messages
    if (message.hasPhoto && message.photoFileId) {
      const fileUrl = await getFileUrl(message.photoFileId);

      if (fileUrl) {
        const photoMsg = message.text !== "[photo]"
          ? "Photo mila aur caption bhi padha! 📸 Ye feature abhi development mein hai — jaldi main photos se directly questions solve kar paungi. Abhi ke liye apne caption mein jo likha hai uska jawab deti hoon!"
          : "Photo mil gayi! 📸 Ye feature abhi development mein hai bachhe — bahut jaldi main photo dekh ke seedha solve kar dungi. Abhi ke liye please question type karke bhej do, main turant help karungi! ✍️";

        await sendTelegramMessage(message.chatId, photoMsg);

        if (message.text !== "[photo]") {
          // Fall through to process caption as normal message
        } else {
          return NextResponse.json({ ok: true });
        }
      } else {
        await sendTelegramMessage(
          message.chatId,
          "Photo nahi khul payi 😅 Please dubara try karo ya question type karke bhej do!"
        );
        return NextResponse.json({ ok: true });
      }
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

    // OTP FLOW
    const otpMatch = message.text.match(/^\s*(\d{6})\s*$/);
    if (otpMatch && user.is_minor && !user.parental_consent) {
      const pendingOTP = await hasPendingOTP(user.id);
      if (pendingOTP) {
        const verified = await verifyOTP(user.id, otpMatch[1]);
        if (verified) {
          const successMsg =
            "Yayy! OTP verified ho gaya! 🎉 Ab apke parents ki permission mil gayi hai. " +
            "Chalo ab properly padhai shuru karte hain. Batao kaunsa topic karein aaj?";
          await saveMessage(user.id, "assistant", successMsg);
          await sendTelegramMessage(message.chatId, successMsg);
          return NextResponse.json({ ok: true });
        } else {
          const failMsg =
            "Ye OTP galat hai ya expire ho gaya 😅 Apne parents se dubara code mangwao. " +
            "Agar 10 minute se zyada ho gaye toh bolo, main nayi OTP bhej dungi!";
          await saveMessage(user.id, "assistant", failMsg);
          await sendTelegramMessage(message.chatId, failMsg);
          return NextResponse.json({ ok: true });
        }
      }
    }

    // Check if minor providing parent phone
    if (user.is_minor && !user.parental_consent) {
      const phoneNumber = detectPhoneNumber(message.text);
      if (phoneNumber) {
        const otp = generateOTP();
        const sent = await sendOTP(phoneNumber, otp);

        if (sent) {
          await createOTPRecord(user.id, phoneNumber, otp);
          const otpSentMsg =
            "Done! Maine apke parents ko ek SMS bhej diya hai OTP ke saath 📱 " +
            "Unse code lo aur yahan type kar do. 10 minute mein expire ho jayega!";
          await saveMessage(user.id, "assistant", otpSentMsg);
          await sendTelegramMessage(message.chatId, otpSentMsg);
        } else {
          const failMsg =
            "Arrey yaar, SMS nahi ja payi 😔 Number check karke dubara bhejo. " +
            "Indian mobile number hona chahiye — jaise 9876543210";
          await saveMessage(user.id, "assistant", failMsg);
          await sendTelegramMessage(message.chatId, failMsg);
        }
        return NextResponse.json({ ok: true });
      }
    }

    // NORMAL AI RESPONSE
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
      model_used: process.env.GEMINI_MODEL || "gemini-2.5-flash",
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
        ? `Hey ${firstName}! 😊 Main Priya hoon — apki NEET prep mein help karungi. Pehle batao, apka naam kya hai aur aap kis class mein ho?`
        : `Hey! 😊 Main Priya hoon — apki NEET prep mein help karungi. Pehle batao, apka naam kya hai aur aap kis class mein ho?`;
      await getOrCreateUser(chatId);
      await sendTelegramMessage(chatId, welcomeMsg);
      break;

    case "/help":
      await sendTelegramMessage(
        chatId,
        "Main apki NEET preparation mein help kar sakti hoon 📚\n\n" +
          "Biology, Chemistry, Physics — kuch bhi pucho! Concept explain karungi, " +
          "mnemonics bataungi, aur practice questions bhi dungi.\n\n" +
          "Bas message karo aur shuru ho jao! 💪"
      );
      break;

    case "/reset":
      await sendTelegramMessage(
        chatId,
        "Accha chalo, fresh start karte hain! Batao kya padhna hai aaj? 🧬"
      );
      break;

    case "/clearitall":
      const user = await getOrCreateUser(chatId);
      await deleteUserData(user.id);
      await sendTelegramMessage(
        chatId,
        "Your data has been permanently deleted as per your request. " +
        "All chat history, profile information, and consent records have been removed. " +
        "If you message again, you'll start fresh as a new user.\n\n" +
        "Apka saara data delete ho gaya hai. Agar dubara message karoge toh naye user ki tarah start hoga."
      );
      break;

    default:
      await sendTelegramMessage(
        chatId,
        "Yaar ye command samajh nahi aayi 😅 Bas normally message karo, main help karungi!"
      );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "Priya AI Telegram webhook is active",
    timestamp: new Date().toISOString(),
  });
}
