import { NextRequest, NextResponse } from "next/server";
import { getOrCreateWhatsAppUser, saveMessage, getRecentHistory, updateUserProfile } from "@/lib/supabase";
import { generateResponse, detectUserInfo } from "@/lib/gemini";
import { sendWhatsAppMessage } from "@/lib/twilio";

export const maxDuration = 30;

// ============================================
// WHATSAPP WEBHOOK HANDLER (Twilio)
// ============================================

export async function POST(request: NextRequest) {
  try {
    // Twilio sends form-encoded data
    const formData = await request.formData();
    const body = formData.get("Body") as string;
    const from = formData.get("From") as string; // whatsapp:+91XXXXXXXXXX
    const profileName = formData.get("ProfileName") as string;

    if (!body || !from) {
      return new NextResponse("OK", { status: 200 });
    }

    // Extract phone number from WhatsApp format
    const phone = from.replace("whatsapp:", "");
    const text = body.trim();

    // Get or create user
    const user = await getOrCreateWhatsAppUser(phone, profileName);

    // Detect user info from message
    const detectedInfo = detectUserInfo(text);
    if (Object.keys(detectedInfo).length > 0) {
      await updateUserProfile(user.id, detectedInfo);
      Object.assign(user, detectedInfo);
    }

    // Save user message
    await saveMessage(user.id, "user", text, undefined, "whatsapp");

    // Get chat history
    const history = await getRecentHistory(user.id, 30);

    // Generate AI response
    const startTime = Date.now();
    const { text: aiResponse, tokensUsed } = await generateResponse(
      text,
      history,
      {
        name: user.name || profileName,
        class: user.class,
        neet_year: user.neet_year,
        is_minor: user.is_minor,
        parental_consent: user.parental_consent,
        message_count: user.message_count,
        weak_subjects: user.weak_subjects,
      }
    );
    const responseTime = Date.now() - startTime;

    // Save AI response
    await saveMessage(user.id, "assistant", aiResponse, {
      tokens_used: tokensUsed,
      model_used: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
      response_time_ms: responseTime,
    }, "whatsapp");

    // Send response via Twilio WhatsApp
    await sendWhatsAppMessage(phone, aiResponse);

    // Return empty TwiML (we send messages via API, not TwiML)
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    return new NextResponse("OK", { status: 200 });
  }
}

// Twilio sends GET for webhook verification
export async function GET() {
  return NextResponse.json({
    status: "Priya AI WhatsApp webhook is active",
    timestamp: new Date().toISOString(),
  });
}
