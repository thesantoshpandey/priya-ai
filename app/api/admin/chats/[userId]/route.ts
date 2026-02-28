import { NextRequest, NextResponse } from "next/server";
import { getUserWithChats, logAdminAccess } from "@/lib/supabase";

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = params;
  const { user, chats } = await getUserWithChats(userId);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await logAdminAccess("view_chats", userId);

  return NextResponse.json({ user, chats });
}
