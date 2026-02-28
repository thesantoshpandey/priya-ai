import { NextRequest, NextResponse } from "next/server";
import { setWebhook } from "@/lib/telegram";

// Call this once to register your webhook with Telegram
// GET /api/telegram/setup?secret=YOUR_ADMIN_PASSWORD

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");

  if (secret !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL not set" }, { status: 500 });
  }

  const webhookUrl = `${appUrl}/api/telegram`;
  const result = await setWebhook(webhookUrl);

  return NextResponse.json({
    message: "Webhook setup attempted",
    webhookUrl,
    telegramResponse: result,
  });
}
