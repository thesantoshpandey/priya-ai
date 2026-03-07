import { NextRequest, NextResponse } from "next/server";
import { getRecentHistory, saveMessage, supabase } from "@/lib/supabase";
import { generateResponse } from "@/lib/gemini";

export const maxDuration = 30;

// ============================================
// VOICE API — Text in, AI text + Cartesia audio out
// SECURED: Requires valid API secret header
// ============================================

export async function POST(request: NextRequest) {
  try {
    // AUTH CHECK — reject unauthenticated requests
    const authHeader = request.headers.get("x-api-secret");
    if (authHeader !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId, text } = await request.json();

    if (!userId || !text) {
      return NextResponse.json({ error: "Missing userId or text" }, { status: 400 });
    }

    // Rate limit check via Supabase
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check daily voice limit (reuse existing daily_voice_count)
    const now = new Date();
    const resetAt = user.daily_reset_at ? new Date(user.daily_reset_at) : new Date(0);
    let voiceCount = user.daily_voice_count || 0;

    if (now > resetAt) {
      voiceCount = 0; // Reset if past reset time
    }

    if (voiceCount >= 10) {
      return NextResponse.json({ error: "Daily voice limit reached" }, { status: 429 });
    }

    // Increment voice count
    await supabase.from("users").update({
      daily_voice_count: voiceCount + 1,
      ...(now > resetAt ? { daily_reset_at: new Date(now.getTime() + 86400000).toISOString() } : {}),
    }).eq("id", userId);

    // Save user message
    await saveMessage(userId, "user", text, undefined, "voice");

    // Get history
    const history = await getRecentHistory(userId, 20);

    // Generate AI response
    const { text: aiResponse, tokensUsed } = await generateResponse(
      text,
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

    // Save AI response
    await saveMessage(userId, "assistant", aiResponse, {
      tokens_used: tokensUsed,
      model_used: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
    }, "voice");

    // Generate audio via Cartesia
    let audioBase64: string | null = null;

    if (process.env.CARTESIA_API_KEY) {
      try {
        const audioResponse = await fetch("https://api.cartesia.ai/tts/bytes", {
          method: "POST",
          headers: {
            "X-API-Key": process.env.CARTESIA_API_KEY,
            "Cartesia-Version": "2024-06-10",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model_id: "sonic-3",
            transcript: aiResponse,
            voice: {
              mode: "id",
              id: process.env.CARTESIA_VOICE_ID || "bef6b65a-abe0-4298-957f-3e41954dfb1c",
            },
            output_format: {
              container: "mp3",
              bit_rate: 128000,
              sample_rate: 44100,
            },
            language: user.preferred_language === "english" ? "en" : "hi",
          }),
        });

        if (audioResponse.ok) {
          const audioBuffer = await audioResponse.arrayBuffer();
          audioBase64 = Buffer.from(audioBuffer).toString("base64");
        } else {
          console.error("Cartesia error:", await audioResponse.text());
        }
      } catch (err) {
        console.error("Cartesia TTS error:", err);
      }
    }

    return NextResponse.json({
      text: aiResponse,
      audio: audioBase64,
      tokensUsed,
    });
  } catch (error) {
    console.error("Voice API error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
