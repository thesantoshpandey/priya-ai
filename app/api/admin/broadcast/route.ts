import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function sendTelegramMessage(chatId: string, text: string) {
  try {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "HTML",
      }),
    });
    const data = await res.json();
    return { success: data.ok, chatId };
  } catch (error) {
    return { success: false, chatId, error: String(error) };
  }
}

export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { message, filter, userId } = body;

  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  let users: any[] = [];

  if (userId) {
    // Send to specific user
    const { data } = await supabase
      .from("users")
      .select("telegram_chat_id")
      .eq("id", userId)
      .single();
    if (data) users = [data];
  } else if (filter === "active_today") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("users")
      .select("telegram_chat_id")
      .gte("last_message_at", today.toISOString());
    users = data || [];
  } else if (filter === "active_week") {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { data } = await supabase
      .from("users")
      .select("telegram_chat_id")
      .gte("last_message_at", weekAgo.toISOString());
    users = data || [];
  } else {
    // Send to ALL users
    const { data } = await supabase
      .from("users")
      .select("telegram_chat_id");
    users = data || [];
  }

  // Send messages with 50ms delay between each to avoid Telegram rate limits
  const results = [];
  for (const user of users) {
    if (user.telegram_chat_id) {
      const result = await sendTelegramMessage(user.telegram_chat_id, message);
      results.push(result);
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  const sent = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return NextResponse.json({
    total: users.length,
    sent,
    failed,
    message: `Broadcast sent to ${sent}/${users.length} users`,
  });
}
