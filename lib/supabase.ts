import { createClient } from "@supabase/supabase-js";

// Use service role key for server-side operations (full access)
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================
// USER OPERATIONS
// ============================================

export async function getOrCreateUser(telegramChatId: string, username?: string) {
  // Check if user exists
  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_chat_id", telegramChatId)
    .single();

  if (existing) {
    // Update last message time and increment count
    await supabase
      .from("users")
      .update({
        message_count: existing.message_count + 1,
        last_message_at: new Date().toISOString(),
        ...(username && !existing.telegram_username ? { telegram_username: username } : {}),
      })
      .eq("id", existing.id);

    return { ...existing, message_count: existing.message_count + 1 };
  }

  // Create new user
  const { data: newUser, error } = await supabase
    .from("users")
    .insert({
      telegram_chat_id: telegramChatId,
      telegram_username: username || null,
      platform: "telegram",
      message_count: 1,
    })
    .select()
    .single();

  if (error) throw error;
  return newUser;
}

export async function updateUserProfile(userId: string, updates: Record<string, any>) {
  const { error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", userId);

  if (error) throw error;
}

export async function getOrCreateWhatsAppUser(phone: string, profileName?: string) {
  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("phone", phone)
    .single();

  if (existing) {
    await supabase
      .from("users")
      .update({
        message_count: existing.message_count + 1,
        last_message_at: new Date().toISOString(),
        ...(profileName && !existing.name ? { name: profileName } : {}),
      })
      .eq("id", existing.id);

    return { ...existing, message_count: existing.message_count + 1 };
  }

  const { data: newUser, error } = await supabase
    .from("users")
    .insert({
      phone,
      name: profileName || null,
      platform: "whatsapp",
      message_count: 1,
    })
    .select()
    .single();

  if (error) throw error;
  return newUser;
}

// ============================================
// CHAT OPERATIONS
// ============================================

export async function saveMessage(
  userId: string,
  role: "user" | "assistant",
  content: string,
  metadata?: { tokens_used?: number; model_used?: string; response_time_ms?: number },
  platform?: string
) {
  const { error } = await supabase.from("chats").insert({
    user_id: userId,
    role,
    content,
    platform: platform || "telegram",
    ...metadata,
  });

  if (error) throw error;
}

export async function getChatHistory(userId: string, limit: number = 50) {
  const { data, error } = await supabase
    .from("chats")
    .select("role, content, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

// Get recent history for Gemini context (last N messages)
export async function getRecentHistory(userId: string, limit: number = 30) {
  const { data, error } = await supabase
    .from("chats")
    .select("role, content")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  // Reverse to get chronological order
  return (data || []).reverse();
}

// ============================================
// ADMIN OPERATIONS
// ============================================

export async function getAllUsers(page: number = 0, pageSize: number = 50) {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from("users")
    .select("*", { count: "exact" })
    .order("last_message_at", { ascending: false })
    .range(from, to);

  if (error) throw error;
  return { users: data || [], total: count || 0 };
}

export async function getUserWithChats(userId: string) {
  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  const { data: chats } = await supabase
    .from("chats")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  return { user, chats: chats || [] };
}

export async function logAdminAccess(action: string, targetUserId?: string) {
  await supabase.from("admin_access_log").insert({
    admin_identifier: "admin",
    action,
    target_user_id: targetUserId || null,
  });
}

// ============================================
// OTP / CONSENT OPERATIONS
// ============================================

export async function createOTPRecord(userId: string, parentPhone: string, otp: string) {
  // Delete any existing pending OTPs for this user
  await supabase
    .from("consent_log")
    .delete()
    .eq("user_id", userId)
    .eq("status", "pending");

  const { error } = await supabase.from("consent_log").insert({
    user_id: userId,
    parent_phone: parentPhone,
    otp_sent_at: new Date().toISOString(),
    consent_text: `Parental consent for minor to use Priya AI NEET preparation service. OTP: ${otp}`,
    status: "pending",
  });

  // Also store OTP hash in a simple way (store in consent_text for now)
  if (error) throw error;
}

export async function verifyOTP(userId: string, otp: string): Promise<boolean> {
  const { data } = await supabase
    .from("consent_log")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!data) return false;

  // Check OTP matches (stored in consent_text)
  if (!data.consent_text.includes(otp)) return false;

  // Check if OTP is not expired (10 minutes)
  const sentAt = new Date(data.otp_sent_at).getTime();
  if (Date.now() - sentAt > 10 * 60 * 1000) return false;

  // Mark as verified
  await supabase
    .from("consent_log")
    .update({
      otp_verified_at: new Date().toISOString(),
      status: "verified",
    })
    .eq("id", data.id);

  // Update user's parental consent status
  await supabase
    .from("users")
    .update({
      parental_consent: true,
      parent_phone: data.parent_phone,
      consent_given_at: new Date().toISOString(),
    })
    .eq("id", userId);

  return true;
}

export async function hasPendingOTP(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("consent_log")
    .select("otp_sent_at")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!data) return false;

  // Check if OTP was sent within last 10 minutes
  const sentAt = new Date(data.otp_sent_at).getTime();
  return Date.now() - sentAt < 10 * 60 * 1000;
}

// ============================================
// ANALYTICS
// ============================================

export async function getStats() {
  const { count: totalUsers } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true });

  const { count: activeToday } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true })
    .gte("last_message_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const { count: totalMessages } = await supabase
    .from("chats")
    .select("*", { count: "exact", head: true });

  const { count: minors } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true })
    .eq("is_minor", true);

  const { count: consented } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true })
    .eq("parental_consent", true);

  return {
    totalUsers: totalUsers || 0,
    activeToday: activeToday || 0,
    totalMessages: totalMessages || 0,
    minors: minors || 0,
    consented: consented || 0,
  };
}
