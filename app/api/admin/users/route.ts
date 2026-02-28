import { NextRequest, NextResponse } from "next/server";
import { getAllUsers, getStats, logAdminAccess } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  // Simple auth check
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const page = parseInt(request.nextUrl.searchParams.get("page") || "0");
  
  const [{ users, total }, stats] = await Promise.all([
    getAllUsers(page),
    getStats(),
  ]);

  await logAdminAccess("view_users");

  return NextResponse.json({ users, total, stats, page });
}
