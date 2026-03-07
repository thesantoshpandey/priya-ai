// Priya AI — Telegram Webhook Handler (updated 2026-03-07)
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
  saveVoiceMessage,
  saveImageMessage,
  supabase,
} from "@/lib/supabase";
import { generateResponse, detectUserInfo, transcribeAudio } from "@/lib/gemini";
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

// ============================================
// AUTO LANGUAGE DETECTION (Unicode script ranges)
// ============================================
function detectLanguageFromScript(text: string): string | null {
  // Count characters in each script
  const scripts: Record<string, number> = {};
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code >= 0x0B80 && code <= 0x0BFF) scripts["tamil"] = (scripts["tamil"] || 0) + 1;
    else if (code >= 0x0C80 && code <= 0x0CFF) scripts["kannada"] = (scripts["kannada"] || 0) + 1;
    else if (code >= 0x0C00 && code <= 0x0C7F) scripts["telugu"] = (scripts["telugu"] || 0) + 1;
    else if (code >= 0x0D00 && code <= 0x0D7F) scripts["malayalam"] = (scripts["malayalam"] || 0) + 1;
    else if (code >= 0x0980 && code <= 0x09FF) scripts["bengali"] = (scripts["bengali"] || 0) + 1;
    else if (code >= 0x0900 && code <= 0x097F) scripts["devanagari"] = (scripts["devanagari"] || 0) + 1;
    else if (code >= 0x0A80 && code <= 0x0AFF) scripts["gujarati"] = (scripts["gujarati"] || 0) + 1;
    else if (code >= 0x0A00 && code <= 0x0A7F) scripts["gurmukhi"] = (scripts["gurmukhi"] || 0) + 1;
    else if (code >= 0x0B00 && code <= 0x0B7F) scripts["odia"] = (scripts["odia"] || 0) + 1;
    else if (code >= 0x0600 && code <= 0x06FF) scripts["urdu"] = (scripts["urdu"] || 0) + 1;
  }

  // Find dominant script (need at least 3 chars)
  let maxScript = "";
  let maxCount = 2;
  for (const [script, count] of Object.entries(scripts)) {
    if (count > maxCount) {
      maxScript = script;
      maxCount = count;
    }
  }

  // Map scripts to languages
  const scriptToLang: Record<string, string> = {
    tamil: "tamil",
    kannada: "kannada",
    telugu: "telugu",
    malayalam: "malayalam",
    bengali: "bengali",
    gujarati: "gujarati",
    gurmukhi: "punjabi",
    odia: "odia",
    urdu: "urdu",
    // devanagari could be Hindi, Marathi, Sanskrit — default to hindi
    // but we keep hinglish as default so don't override for devanagari
  };

  if (maxScript && scriptToLang[maxScript]) {
    return scriptToLang[maxScript];
  }

  return null;
}

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
    // SOFT DATA COLLECTION (chat-first, collect later)
    // Let students chat immediately, ask for details naturally after engagement
    // ============================================

    // Always try to capture phone/email if user voluntarily sends one
    const phoneNumber = detectPhoneNumber(message.text);
    if (phoneNumber && !user.phone) {
      await updateUserProfile(user.id, { phone: phoneNumber });
      user.phone = phoneNumber;
      if (!user.email) {
        await sendTelegramMessage(
          message.chatId,
          "Thanks yaar! ✅ Ek aur cheez — email bhi de do, study material bhejungi direct inbox mein 📧"
        );
        return NextResponse.json({ ok: true });
      } else {
        await sendTelegramMessage(
          message.chatId,
          "Saved! ✅ Ab bolo kya padhna hai aaj? 💪"
        );
        return NextResponse.json({ ok: true });
      }
    }

    const emailMatch = message.text.match(
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
    );
    if (emailMatch && !user.email) {
      await updateUserProfile(user.id, { email: emailMatch[1].toLowerCase() });
      user.email = emailMatch[1].toLowerCase();
      if (!user.phone) {
        await sendTelegramMessage(
          message.chatId,
          "Email saved! ✅ Phone number bhi de do — reminders bhejungi exam se pehle 📱"
        );
        return NextResponse.json({ ok: true });
      } else {
        await sendTelegramMessage(
          message.chatId,
          "Perfect! ✅ All set. Ab padhai pe dhyaan! 🔥"
        );
        return NextResponse.json({ ok: true });
      }
    }

    // ============================================
    // NORMAL FLOW — EVERYONE GETS TO CHAT
    // ============================================

    // Handle voice messages — transcribe with Gemini, store audio, reply with voice
    if (message.hasVoice && message.voiceFileId) {
      const voiceUrl = await getFileUrl(message.voiceFileId);
      if (voiceUrl) {
        await sendTypingAction(message.chatId);

        try {
          const audioResponse = await fetch(voiceUrl);
          const audioBuffer = await audioResponse.arrayBuffer();
          const audioNodeBuffer = Buffer.from(audioBuffer);
          const base64Audio = audioNodeBuffer.toString("base64");

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
                preferred_language: user.preferred_language,
              },
              undefined,
              base64Audio
            );

          // Save chat messages
          await saveMessage(user.id, "user", "[voice message]");
          await saveMessage(user.id, "assistant", aiResponse, {
            tokens_used: tokensUsed,
            model_used: process.env.GEMINI_MODEL || "gemini-2.5-flash",
          });

          // Transcribe audio in background (non-blocking for response speed)
          const transcriptionPromise = transcribeAudio(base64Audio);

          // Detect content flags from AI response
          const lowerResponse = aiResponse.toLowerCase();
          let contentFlag = "clean";
          let flaggedReason: string | undefined = undefined;
          if (
            lowerResponse.includes("bakwas band") ||
            lowerResponse.includes("aise nahi chalega") ||
            lowerResponse.includes("aye! ye kya hai")
          ) {
            contentFlag = "inappropriate";
            flaggedReason = "AI triggered content safety response";
          }

          // Wait for transcription (runs in parallel with content flag detection)
          const transcription = await transcriptionPromise;

          // Store voice message to data bank with transcription
          saveVoiceMessage(user.id, message.voiceFileId, audioNodeBuffer, {
            duration: undefined,
            fileSize: audioNodeBuffer.length,
            mimeType: "audio/ogg",
            transcription: transcription || undefined,
            aiResponse: aiResponse,
            contentFlag,
            flaggedReason,
          }).catch((err) => console.error("Voice storage error:", err));

          // Send text response
          await sendTelegramMessage(message.chatId, aiResponse);

          // Also send voice note if Cartesia is configured
          const voiceBuffer = await generateVoice(aiResponse, user.preferred_language);
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

    // ============================================
    // AUTO LANGUAGE DETECTION (script-based)
    // ============================================
    if (!user.preferred_language || user.preferred_language === "hinglish") {
      const detected = detectLanguageFromScript(message.text);
      if (detected && detected !== "hinglish") {
        await updateUserProfile(user.id, { preferred_language: detected });
        user.preferred_language = detected;
      }
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
        preferred_language: user.preferred_language,
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

    // ============================================
    // STORE IMAGE if this was a photo message
    // ============================================
    if (imageUrl && message.photoFileId) {
      (async () => {
        try {
          const imgRes = await fetch(imageUrl);
          const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
          const mimeType = imgRes.headers.get("content-type") || "image/jpeg";

          let imgFlag = "clean";
          let imgFlagReason: string | undefined = undefined;
          const lowerResp = aiResponse.toLowerCase();
          if (lowerResp.includes("bakwas") || lowerResp.includes("aise nahi")) {
            imgFlag = "inappropriate";
            imgFlagReason = "AI triggered content safety response";
          }

          await saveImageMessage(user.id, message.photoFileId!, imgBuffer, {
            fileSize: imgBuffer.length,
            mimeType,
            caption: message.text !== "[photo]" ? message.text : undefined,
            aiResponse,
            contentFlag: imgFlag,
            flaggedReason: imgFlagReason,
          });
        } catch (err) {
          console.error("Image storage error:", err);
        }
      })();
    }

    // ============================================
    // SOFT NUDGE: Ask for phone/email after engagement
    // Nudge at message 5, 20, 40 — not every message
    // ============================================
    const msgCount = (user.message_count || 0) + 1;
    if (!user.phone && (msgCount === 5 || msgCount === 20 || msgCount === 40)) {
      setTimeout(async () => {
        try {
          await sendTelegramMessage(
            message.chatId,
            msgCount === 5
              ? "Btw yaar 😊 apna phone number de do — exam dates aur important updates bhejungi direct! Jaise 9876543210 📱"
              : msgCount === 20
              ? "Arey sun, abhi tak phone number nahi diya! 😤 De do na — study reminders bhejungi, bohot kaam ayega 📲"
              : "Last time bol rahi hoon — number do! 😂 Tumhare jaise serious student ko reminders milne chahiye 📱"
          );
        } catch (e) { /* ignore */ }
      }, 2000);
    } else if (user.phone && !user.email && (msgCount === 8 || msgCount === 25)) {
      setTimeout(async () => {
        try {
          await sendTelegramMessage(
            message.chatId,
            "Ek aur baat — email bhi de do! Study notes aur PDF direct inbox mein bhejungi 📧"
          );
        } catch (e) { /* ignore */ }
      }, 2000);
    }

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

      // Track referral
      if (referralFromChatId && user.message_count <= 1) {
        try {
          await updateUserProfile(user.id, { referred_by: referralFromChatId });
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
            await sendTelegramMessage(
              referralFromChatId,
              "🎉 Ek naya student apke link se join hua! Keep sharing — jitne zyada friends, utne zyada rewards! 💪"
            );
          }
        } catch (e) {
          console.error("Referral tracking error:", e);
        }
      }

      // Save first name if available
      if (firstName && !user.name) {
        await updateUserProfile(user.id, { name: firstName });
      }

      // Returning user
      if (user.message_count > 2) {
        const welcomeMsg = firstName
          ? `${firstName}! 😊 Wapas aa gaye! Batao kya padhna hai aaj?`
          : `Hey! 😊 Wapas aa gaye! Batao kya padhna hai aaj?`;
        await sendTelegramMessage(chatId, welcomeMsg);
      } else {
        // NEW user — chat-first, no registration wall
        const name = firstName || "yaar";
        await sendTelegramMessage(
          chatId,
          `Hey ${name}! 😊 Main Priya hoon — NEET Biology teacher, 2017 se padha rahi hoon.\n\n` +
          `Seedha doubt pucho — Biology, Chemistry, Physics kuch bhi! Photo bhejo, voice bhejo, ya type karo 💪\n\n` +
          `Hindi, Tamil, Kannada, Telugu, Bengali, Marathi, Malayalam — apni bhasha mein padho! 🇮🇳🔥`
        );
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
