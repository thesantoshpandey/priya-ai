import { NextRequest, NextResponse } from "next/server";
import { getOrCreateWhatsAppUser, saveMessage, getRecentHistory, updateUserProfile } from "@/lib/supabase";
import { generateResponse, detectUserInfo } from "@/lib/gemini";
import { sendWhatsAppMessage } from "@/lib/twilio";
import twilio from "twilio";

export const maxDuration = 30;

// ============================================
// WHATSAPP WEBHOOK HANDLER (Twilio)
// SECURED: Validates Twilio request signature
// ============================================

export async function POST(request: NextRequest) {
  try {
    // KILL SWITCH — disable WhatsApp until properly configured
    if (!process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_WHATSAPP_NUMBER) {
      return new NextResponse("WhatsApp not configured", { status: 503 });
    }

    // TWILIO SIGNATURE VALIDATION — reject forged requests
    const twilioSignature = request.headers.get("x-twilio-signature");
    if (!twilioSignature) {
      return new NextResponse("Missing signature", { status: 403 });
    }

    const url = request.url;
    const formData = await request.formData();
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value as string;
    });

    const isValid = twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN!,
      twilioSignature,
      url,
      params
    );

    if (!isValid) {
      console.error("Invalid Twilio signature — possible forged request");
      return new NextResponse("Invalid signature", { status: 403 });
    }

    // Signature valid — process the message
    const body = params["Body"];
    const from = params["From"]; // whatsapp:+91XXXXXXXXXX
    const profileName = params["ProfileName"];

    if (!body || !from) {
      return new NextResponse("OK", { status: 200 });
    }

    const phone = from.replace("whatsapp:", "");
    const text = body.trim();

    const user = await getOrCreateWhatsAppUser(phone, profileName);

    const detectedInfo = detectUserInfo(text);
    if (Object.keys(detectedInfo).length > 0) {
      await updateUserProfile(user.id, detectedInfo);
      Object.assign(user, detectedInfo);
    }

    await saveMessage(user.id, "user", text, undefined, "whatsapp");

    const history = await getRecentHistory(user.id, 30);

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

    await saveMessage(user.id, "assistant", aiResponse, {
      tokens_used: tokensUsed,
      model_used: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
      response_time_ms: responseTime,
    }, "whatsapp");

    await sendWhatsAppMessage(phone, aiResponse);

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
