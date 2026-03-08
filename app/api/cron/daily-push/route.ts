// Priya AI — Daily Push (7 PM IST cron)
// Sends one NEET tip/question/motivation to all users daily
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// Content types rotate by day of year
const CONTENT_TYPES = [
  "biology_mcq",
  "physics_concept",
  "chemistry_trick",
  "motivation",
  "study_tip",
  "mnemonic",
  "science_fact",
] as const;

type ContentType = (typeof CONTENT_TYPES)[number];

const CONTENT_PROMPTS: Record<ContentType, string> = {
  biology_mcq: `You are Priya, a NEET Biology teacher. Generate ONE interesting NEET-level Biology MCQ.
Format:
🧬 <b>NEET Daily — Biology</b>

[Question — should be conceptual, not just memory-based]

A) [option]
B) [option]
C) [option]
D) [option]

Reply with your answer! Main bataungi sahi hai ya nahi 😊

Keep total under 500 characters. Use Hinglish naturally. Make it from high-yield NEET topics (Genetics, Ecology, Human Physiology, Plant Physiology, Cell Biology).`,

  physics_concept: `You are Priya, a NEET teacher. Explain ONE Physics concept in a fun, memorable way.
Format:
⚡ <b>NEET Daily — Physics</b>

[Pick one tricky NEET Physics concept — explain it in 2-3 lines like you're texting a student. Use a real-life analogy.]

Kal ye question aaya toh galat mat karna! 💪

Keep under 400 characters. Hinglish. Topics: Mechanics, Electrostatics, Optics, Modern Physics, Thermodynamics, Waves.`,

  chemistry_trick: `You are Priya, a NEET teacher. Share ONE Chemistry shortcut/trick for NEET.
Format:
⚗️ <b>NEET Daily — Chemistry</b>

[One specific trick, shortcut, or pattern that helps solve NEET Chemistry questions faster. Be specific — a formula hack, a trend, a comparison.]

Save karlo — exam mein kaam aayega! 📝

Keep under 400 characters. Hinglish. Topics: Organic reactions, Periodic trends, Chemical bonding, Coordination compounds, Electrochemistry.`,

  motivation: `You are Priya, a caring NEET teacher who has seen hundreds of students prepare. Write a short motivational message for NEET aspirants.
Format:
🔥 <b>Priya Ma'am ka message</b>

[2-3 lines of genuine, warm motivation. Not generic "believe in yourself" — be specific to NEET journey. Reference the grind, the pressure, the doubt, and why it's worth it. Feel like a real teacher texting her student.]

Keep under 350 characters. Hinglish. End with an encouraging line and emoji.`,

  study_tip: `You are Priya, a NEET teacher since 2017. Share ONE specific study technique.
Format:
📚 <b>Study Tip of the Day</b>

[One specific, actionable study technique. Not generic "make notes" — something concrete like a specific revision method, time-boxing technique, or memory strategy that works for NEET.]

Try karo aaj — fark dikhega! ✨

Keep under 400 characters. Hinglish.`,

  mnemonic: `You are Priya, a NEET teacher. Create ONE helpful mnemonic for a NEET topic.
Format:
🧠 <b>Mnemonic of the Day</b>

[Topic name]
[The mnemonic — make it catchy, funny, or relatable to Indian students]
[What each letter/word stands for]

Ek baar yaad karlo, kabhi nahi bhuloge! 😄

Keep under 450 characters. Hinglish. Pick from: Biology classification, Chemistry reactions/series, Physics formulas, important lists.`,

  science_fact: `You are Priya, a NEET teacher. Share ONE mind-blowing science fact related to NEET syllabus.
Format:
🤯 <b>Did You Know?</b>

[One fascinating science fact that's related to NEET syllabus but presented in a wow-factor way. Connect it to a chapter/topic so students learn something.]

NEET mein ye topic se question aa sakta hai — padh lo! 📖

Keep under 400 characters. Hinglish.`,
};

async function generateDailyContent(contentType: ContentType): Promise<string> {
  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    });

    const today = new Date().toISOString().split("T")[0];
    const result = await model.generateContent(
      CONTENT_PROMPTS[contentType] +
        `\n\nToday's date: ${today}. Generate fresh content — don't repeat common examples. NEET 2026 is May 4.`
    );

    let text = result.response.text().trim();

    // Add Priya AI CTA footer
    text +=
      "\n\n💬 Doubt hai? Abhi pucho — main 24/7 available hoon! Bas message karo ⬇️";

    return text;
  } catch (error) {
    console.error("Gemini generation failed:", error);
    // Fallback static content
    return (
      "🔥 <b>Priya Ma'am ka message</b>\n\n" +
      "NEET 2026 ke liye har din count karta hai! Aaj ka ek chapter finish karo — chhota step bhi step hai 💪\n\n" +
      "💬 Doubt hai? Abhi pucho — main 24/7 available hoon!"
    );
  }
}

async function sendToUser(
  chatId: string,
  text: string
): Promise<{ success: boolean; chatId: string; blocked?: boolean }> {
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

    // Detect blocked/deactivated users
    if (
      !data.ok &&
      (data.error_code === 403 || data.error_code === 400)
    ) {
      return { success: false, chatId, blocked: true };
    }
    return { success: data.ok, chatId };
  } catch (error) {
    return { success: false, chatId };
  }
}

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends this header for cron jobs)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Allow both Vercel cron (Authorization: Bearer <CRON_SECRET>) and manual trigger with admin password
  if (
    cronSecret &&
    authHeader !== `Bearer ${cronSecret}` &&
    authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Determine content type based on day of year
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor(
    (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  );
  const contentType = CONTENT_TYPES[dayOfYear % CONTENT_TYPES.length];

  // Generate content
  const content = await generateDailyContent(contentType);

  // Get all users
  const { data: users, error } = await supabase
    .from("users")
    .select("telegram_chat_id");

  if (error || !users) {
    return NextResponse.json(
      { error: "Failed to fetch users", detail: error },
      { status: 500 }
    );
  }

  // Send with 50ms delay to avoid Telegram rate limits
  let sent = 0;
  let failed = 0;
  let blocked = 0;

  for (const user of users) {
    if (user.telegram_chat_id) {
      const result = await sendToUser(user.telegram_chat_id, content);
      if (result.success) sent++;
      else if (result.blocked) blocked++;
      else failed++;
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  // Log to DB
  try {
    await supabase.from("daily_pushes").insert({
      content_type: contentType,
      content: content,
      total_users: users.length,
      sent,
      failed,
      blocked,
      sent_at: new Date().toISOString(),
    });
  } catch (e) {
    // Table might not exist yet — non-critical
    console.error("Failed to log push:", e);
  }

  return NextResponse.json({
    contentType,
    totalUsers: users.length,
    sent,
    failed,
    blocked,
    preview: content.substring(0, 200) + "...",
  });
}
