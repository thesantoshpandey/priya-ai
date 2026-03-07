import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logAdminAccess } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [
    { count: totalUsers },
    { count: activeToday },
    { count: active7d },
    { count: totalMessages },
    { count: totalVoice },
    { count: totalImages },
    { count: bounced },
    { count: powerUsers },
    { count: chats24h },
    { data: langStats },
    { data: voiceMessages },
    { data: topUsers },
  ] = await Promise.all([
    supabase.from("users").select("*", { count: "exact", head: true }),
    supabase.from("users").select("*", { count: "exact", head: true })
      .gte("last_message_at", new Date(Date.now() - 86400000).toISOString()),
    supabase.from("users").select("*", { count: "exact", head: true })
      .gte("last_message_at", new Date(Date.now() - 604800000).toISOString()),
    supabase.from("chats").select("*", { count: "exact", head: true }),
    supabase.from("voice_messages").select("*", { count: "exact", head: true }),
    supabase.from("image_messages").select("*", { count: "exact", head: true }),
    supabase.from("users").select("*", { count: "exact", head: true }).eq("message_count", 1),
    supabase.from("users").select("*", { count: "exact", head: true }).gt("message_count", 50),
    supabase.from("chats").select("*", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 86400000).toISOString()),
    supabase.rpc("exec_sql", {
      query: "SELECT COALESCE(preferred_language, 'unknown') as lang, count(*) as cnt FROM users GROUP BY preferred_language ORDER BY cnt DESC",
    }),
    supabase.from("voice_messages")
      .select("*, users(name, telegram_username)")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("users")
      .select("id, name, telegram_username, preferred_language, message_count, last_message_at, daily_text_count, daily_voice_count, daily_image_count")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200),
  ]);

  // Generate signed URLs for voice message audio playback
  const voiceWithUrls = await Promise.all(
    (voiceMessages || []).map(async (v: any) => {
      let audioUrl: string | null = null;
      if (v.storage_path) {
        const { data } = await supabase.storage
          .from("voice-messages")
          .createSignedUrl(v.storage_path, 3600); // 1 hour expiry
        audioUrl = data?.signedUrl || null;
      }
      return { ...v, audioUrl };
    })
  );

  await logAdminAccess("view_dashboard");

  return NextResponse.json({
    stats: {
      totalUsers: totalUsers || 0,
      activeToday: activeToday || 0,
      active7d: active7d || 0,
      totalMessages: totalMessages || 0,
      totalVoice: totalVoice || 0,
      totalImages: totalImages || 0,
      bounced: bounced || 0,
      powerUsers: powerUsers || 0,
      chats24h: chats24h || 0,
    },
    langStats: langStats || [],
    voiceMessages: voiceWithUrls,
    users: topUsers || [],
  });
}
