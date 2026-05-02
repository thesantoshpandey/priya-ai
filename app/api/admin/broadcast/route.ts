import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

async function sendBroadcastMessage(chatId: string, text: string) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "HTML",
      }),
    });
    const data = await res.json();
    return {
      success: !!data.ok,
      chatId,
      blocked: data.error_code === 403 || data.error_code === 400,
      errorCode: data.error_code ?? null,
      errorDescription: data.description ?? null,
    };
  } catch (error) {
    return {
      success: false,
      chatId,
      blocked: false,
      errorCode: null,
      errorDescription: String(error),
    };
  }
}

export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { message, filter, userId, triggeredBy } = body;

  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const startedAt = Date.now();

  let users: { id?: string; telegram_chat_id: string }[] = [];

  if (userId) {
    const { data } = await supabase
      .from("users")
      .select("id, telegram_chat_id")
      .eq("id", userId)
      .single();
    if (data) users = [data];
  } else if (filter === "active_today") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("users")
      .select("id, telegram_chat_id")
      .gte("last_message_at", today.toISOString());
    users = data || [];
  } else if (filter === "active_week") {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { data } = await supabase
      .from("users")
      .select("id, telegram_chat_id")
      .gte("last_message_at", weekAgo.toISOString());
    users = data || [];
  } else {
    const { data } = await supabase
      .from("users")
      .select("id, telegram_chat_id")
      .or("bot_blocked.is.null,bot_blocked.eq.false");
    users = data || [];
  }

  // ============================================
  // CREATE broadcasts ROW UP FRONT
  // So if the function dies mid-loop, we still have a record.
  // ============================================
  const { data: broadcastRow, error: bErr } = await supabase
    .from("broadcasts")
    .insert({
      message,
      filter_type: filter || (userId ? "single_user" : "all"),
      target_user_id: userId || null,
      total_users: users.length,
      sent_count: 0,
      failed_count: 0,
      newly_blocked: 0,
      triggered_by: triggeredBy || null,
    })
    .select("id")
    .single();

  if (bErr || !broadcastRow) {
    console.error("[BROADCAST] Failed to create broadcasts row:", bErr);
    return NextResponse.json(
      { error: "Failed to create broadcast log row", detail: bErr },
      { status: 500 }
    );
  }
  const broadcastId = broadcastRow.id;

  // Send messages with 50ms delay between each to avoid Telegram rate limits
  const results: { success: boolean; chatId: string; blocked: boolean; errorCode: number | null; errorDescription: string | null }[] = [];
  const deliveryRows: any[] = [];
  let newlyBlocked = 0;

  for (const user of users) {
    if (!user.telegram_chat_id) continue;

    const result = await sendBroadcastMessage(user.telegram_chat_id, message);
    results.push(result);

    deliveryRows.push({
      broadcast_id: broadcastId,
      user_id: user.id ?? null,
      telegram_chat_id: user.telegram_chat_id,
      success: result.success,
      error_code: result.errorCode,
      error_description: result.errorDescription,
    });

    if (!result.success && result.blocked && user.id) {
      newlyBlocked++;
      try {
        await supabase
          .from("users")
          .update({ bot_blocked: true })
          .eq("id", user.id);
      } catch (e) {}
    }

    await new Promise((r) => setTimeout(r, 50));
  }

  // Bulk-insert delivery rows in batches (Supabase has row limit per insert)
  const BATCH = 100;
  for (let i = 0; i < deliveryRows.length; i += BATCH) {
    try {
      await supabase
        .from("broadcast_deliveries")
        .insert(deliveryRows.slice(i, i + BATCH));
    } catch (e) {
      console.error("[BROADCAST] Failed to insert delivery batch:", e);
    }
  }

  const sent = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const durationMs = Date.now() - startedAt;

  // Update broadcasts row with final counts
  try {
    await supabase
      .from("broadcasts")
      .update({
        sent_count: sent,
        failed_count: failed,
        newly_blocked: newlyBlocked,
        duration_ms: durationMs,
      })
      .eq("id", broadcastId);
  } catch (e) {
    console.error("[BROADCAST] Failed to update final counts:", e);
  }

  return NextResponse.json({
    broadcast_id: broadcastId,
    total: users.length,
    sent,
    failed,
    newly_blocked: newlyBlocked,
    duration_ms: durationMs,
    message: `Broadcast sent to ${sent}/${users.length} users (${newlyBlocked} newly blocked)`,
  });
}
