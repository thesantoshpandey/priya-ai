import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateUser,
  saveMessage,
  getRecentHistory,
  updateUserProfile,
  createOTPRecord,
  verifyOTP,
  hasPendingOTP,
  deleteUserData,
  supabase,
} from "@/lib/supabase";
import { generateResponse, detectUserInfo } from "@/lib/gemini";
import {
  parseTelegramUpdate,
  sendTelegramMessage,
  sendTypingAction,
  getFileUrl,
  sendVoiceNote,
  generateVoice,
} from "@/lib/telegram";
import { sendOTP, generateOTP, detectPhoneNumber } from "@/lib/twilio";

export const maxDuration = 30;

// ============================================
// SIMPLE RATE LIMITER (per user, in-memory)
// ============================================

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_PER_MINUTE = 10;
const RATE_LIMIT_PER_DAY = 500;
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
    const secretHeader = request.headers.get(
      "x-telegram-bot-api-secret-token"
    );
    if (secretHeader !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const message = parseTelegramUpdate(body);

    if (!message) {
      return NextResponse.json({ ok: true });
    }

    if (message.isCommand) {
      // Extract referral code from /start ref_XXXXX
      const refMatch = message.text.match(/^\/start\s+ref_(\d+)$/i);
      const referralFromChatId = refMatch ? refMatch[1] : undefined;
      
      await handleCommand(
        message.chatId,
        message.command!,
        message.firstName,
        referralFromChatId
      );
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

    // Get or create user
    const user = await getOrCreateUser(message.chatId, message.username);

    // ============================================
    // MANDATORY REGISTRATION GATE
    // Phone + Email required before ANY chat access
    // ============================================

    // STEP 1: Check if phone is registered
    // NOTE: OTP temporarily disabled — collecting phone directly until Twilio upgrade completes
    if (!user.phone) {
      // Check if user is sending a phone number
      const phoneNumber = detectPhoneNumber(message.text);
      if (phoneNumber) {
        // Save phone directly (no OTP for now)
        await updateUserProfile(user.id, { phone: phoneNumber });
        // Now check email
        if (!user.email) {
          await sendTelegramMessage(
            message.chatId,
            "Phone saved! ✅ Ab ek last step — apna email do, main study material aur schedule bhejungi 📧"
          );
        } else {
          await sendTelegramMessage(
            message.chatId,
            "Registration complete! ✅🎉 Main Priya — apki NEET mentor. Batao bachhe, kya padhna hai aaj?"
          );
        }
        return NextResponse.json({ ok: true });
      }

      // No phone number sent — ask for phone
      await sendTelegramMessage(
        message.chatId,
        "Hey! 😊 Main Priya hoon, apki NEET mentor. Shuru karne se pehle ek choti si registration — apna phone number bhejo (jaise 9876543210) 📱"
      );
      return NextResponse.json({ ok: true });
    }

    // STEP 2: Phone verified, check email
    if (!user.email) {
      // Check if user is sending an email
      const emailMatch = message.text.match(
        /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
      );
      if (emailMatch) {
        await updateUserProfile(user.id, {
          email: emailMatch[1].toLowerCase(),
        });
        await sendTelegramMessage(
          message.chatId,
          "Perfect! Registration complete! ✅🎉 Main Priya — apki NEET mentor. Batao bachhe, kaunsi class mein ho aur kya padhna hai aaj?"
        );
        return NextResponse.json({ ok: true });
      }

      // No email sent — ask for it
      await sendTelegramMessage(
        message.chatId,
        "Phone verified! ✅ Ab bas apna email do — study material aur schedule bhejungi 📧"
      );
      return NextResponse.json({ ok: true });
    }

    // ============================================
    // REGISTRATION COMPLETE — NORMAL FLOW BELOW
    // ============================================

    // Handle voice messages — transcribe with Gemini, reply with voice
    if (message.hasVoice && message.voiceFileId) {
      const voiceUrl = await getFileUrl(message.voiceFileId);
      if (voiceUrl) {
        await sendTypingAction(message.chatId);

        // Download voice file and send to Gemini as audio
        try {
          const audioResponse = await fetch(voiceUrl);
          const audioBuffer = await audioResponse.arrayBuffer();
          const base64Audio =
            Buffer.from(audioBuffer).toString("base64");

          const history = await getRecentHistory(user.id, 20);

          const { text: aiResponse, tokensUsed } =
            await generateResponse(
              "[voice_message]",
              history,
              {
                name: user.name,
                class: user.class,
                neet_year: user.neet_year,
                is_minor: user.is_minor,
                parental_consent: user.parental_consent,
                message_count: user.message_count,
                weak_subjects: user.weak_subjects,
              },
              undefined, // no image
              base64Audio // audio
            );

          await saveMessage(user.id, "user", "[voice message]");
          await saveMessage(user.id, "assistant", aiResponse, {
            tokens_used: tokensUsed,
            model_used:
              process.env.GEMINI_MODEL || "gemini-2.5-flash",
          });

          // Send text response
          await sendTelegramMessage(message.chatId, aiResponse);

          // Also send voice note if Cartesia is configured
          const voiceBuffer = await generateVoice(aiResponse);
          if (voiceBuffer) {
            await sendVoiceNote(message.chatId, voiceBuffer);
          }
        } catch (err) {
          console.error("Voice processing error:", err);
          await sendTelegramMessage(
            message.chatId,
            "Voice note sun nahi payi 😅 Text mein type kardo, main help karungi!"
          );
        }
        return NextResponse.json({ ok: true });
      } else {
        await sendTelegramMessage(
          message.chatId,
          "Voice note nahi khul payi 😅 Dubara bhejo ya text mein type kardo!"
        );
        return NextResponse.json({ ok: true });
      }
    }

    // Handle photo messages — send to Gemini Vision
    let imageUrl: string | undefined;
    if (message.hasPhoto && message.photoFileId) {
      const url = await getFileUrl(message.photoFileId);
      if (url) {
        imageUrl = url;
        // Fall through to normal AI processing with image
      } else {
        await sendTelegramMessage(
          message.chatId,
          "Photo nahi khul payi 😅 Please dubara try karo ya question type karke bhej do!"
        );
        return NextResponse.json({ ok: true });
      }
    }

    await sendTypingAction(message.chatId);

    // Detect and update user info
    const detectedInfo = detectUserInfo(message.text);
    if (Object.keys(detectedInfo).length > 0) {
      await updateUserProfile(user.id, detectedInfo);
      Object.assign(user, detectedInfo);
    }

    await saveMessage(user.id, "user", message.text);

    // OTP FLOW for minor parental consent (separate from registration OTP)
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

    // Check if minor providing parent phone for consent
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
            'Arrey yaar, SMS nahi ja payi 😔 Number check karke dubara bhejo. ' +
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
      },
      imageUrl
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

async function handleCommand(
  chatId: string,
  command: string,
  firstName?: string,
  referralFromChatId?: string
) {
  switch (command) {
    case "/start":
      const user = await getOrCreateUser(chatId);

      // Track referral if this is a new user coming from a referral link
      if (referralFromChatId && user.message_count <= 1) {
        try {
          // Save who referred this user
          await updateUserProfile(user.id, { referred_by: referralFromChatId });
          // Increment referrer's count
          const { data: referrer } = await supabase
            .from("users")
            .select("id, referral_count")
            .eq("telegram_chat_id", referralFromChatId)
            .single();
          if (referrer) {
            await supabase
              .from("users")
              .update({ referral_count: (referrer.referral_count || 0) + 1 })
              .eq("id", referrer.id);
            // Notify the referrer
            await sendTelegramMessage(
              referralFromChatId,
              "🎉 Ek naya student apke link se join hua! Keep sharing — jitne zyada friends, utne zyada rewards! 💪"
            );
          }
        } catch (e) {
          console.error("Referral tracking error:", e);
        }
      }

      // Check if already registered
      if (user.phone && user.email) {
        const welcomeMsg = firstName
          ? `Hey ${firstName}! 😊 Wapas aa gaye! Batao kya padhna hai aaj?`
          : `Hey! 😊 Wapas aa gaye! Batao kya padhna hai aaj?`;
        await sendTelegramMessage(chatId, welcomeMsg);
      } else {
        const welcomeMsg = firstName
          ? `Hey ${firstName}! 😊 Main Priya hoon — apki NEET mentor. Shuru karne ke liye apna phone number bhejo (jaise 9876543210). Quick registration hai! 📱`
          : `Hey! 😊 Main Priya hoon — apki NEET mentor. Shuru karne ke liye apna phone number bhejo (jaise 9876543210). Quick registration hai! 📱`;
        await sendTelegramMessage(chatId, welcomeMsg);
      }
      break;

    case "/refer":
      const referLink = `https://t.me/ProfPriyaPandeybot?start=ref_${chatId}`;
      let referCount = 0;
      try {
        const referUser = await getOrCreateUser(chatId);
        referCount = referUser.referral_count || 0;
      } catch (e) { /* columns may not exist yet */ }
      await sendTelegramMessage(
        chatId,
        `🔗 Apka referral link:\n${referLink}\n\n` +
        `Apne friends ko bhejo — jab wo join karenge, aapko points milenge! 🎁\n\n` +
        `Ab tak ${referCount} friend${referCount !== 1 ? 's' : ''} join kiya apke link se! ` +
        (referCount >= 5 ? "🔥 Amazing!" : referCount >= 1 ? "💪 Keep going!" : "Chalo shuru karte hain!")
      );
      break;

    case "/points":
      let points = 0;
      try {
        const pointsUser = await getOrCreateUser(chatId);
        points = pointsUser.referral_count || 0;
      } catch (e) { /* columns may not exist yet */ }
      let tier = "";
      if (points >= 10) tier = "🏆 GOLD — Podcast shoutout + surprise gift!";
      else if (points >= 5) tier = "🥈 SILVER — Special study material access!";
      else if (points >= 1) tier = "🥉 BRONZE — Keep sharing for bigger rewards!";
      else tier = "Share karo aur earn karo! /refer se link lo 📲";
      
      await sendTelegramMessage(
        chatId,
        `📊 Apke referral points: ${points}\n\n${tier}`
      );
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
      const userToClear = await getOrCreateUser(chatId);
      await deleteUserData(userToClear.id);
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
