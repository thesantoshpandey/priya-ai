import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { transcribeAudio } from "@/lib/gemini";

// ONE-TIME ROUTE: Backfill transcriptions for existing voice messages
// DELETE THIS FILE AFTER RUNNING ONCE
// GET /api/admin/backfill-transcriptions?secret=ADMIN_PASSWORD

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all voice messages without transcription
  const { data: messages, error } = await supabase
    .from("voice_messages")
    .select("id, storage_path")
    .is("transcription", null)
    .not("storage_path", "is", null)
    .order("created_at", { ascending: true });

  if (error || !messages?.length) {
    return NextResponse.json({
      message: "No messages to backfill",
      error: error?.message,
    });
  }

  const results: any[] = [];

  for (const msg of messages) {
    try {
      // Download audio from storage
      const { data: audioData, error: dlError } = await supabase.storage
        .from("voice-messages")
        .download(msg.storage_path!);

      if (dlError || !audioData) {
        results.push({ id: msg.id, status: "download_failed", error: dlError?.message });
        continue;
      }

      // Convert to base64
      const buffer = Buffer.from(await audioData.arrayBuffer());
      const base64Audio = buffer.toString("base64");

      // Transcribe with Gemini
      const transcription = await transcribeAudio(base64Audio);

      if (transcription) {
        // Save transcription
        await supabase
          .from("voice_messages")
          .update({ transcription })
          .eq("id", msg.id);

        results.push({ id: msg.id, status: "ok", transcription: transcription.substring(0, 100) });
      } else {
        results.push({ id: msg.id, status: "no_transcription" });
      }

      // Small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err: any) {
      results.push({ id: msg.id, status: "error", error: err.message });
    }
  }

  return NextResponse.json({
    total: messages.length,
    processed: results.length,
    results,
  });
}
