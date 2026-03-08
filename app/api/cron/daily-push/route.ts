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
  biology_mcq: `You are Priya, a NEET Biology teacher since 2017. Generate ONE interesting NEET-level Biology MCQ.
Format EXACTLY like this (use HTML tags, NOT markdown):
🧬 <b>NEET Daily — Biology</b>

[Question — conceptual, not just memory-based, from high-yield topics]

A) [option]
B) [option]
C) [option]
D) [option]

Reply with your answer! Main bataungi sahi hai ya nahi 😊

Rules: Under 500 chars. Hinglish. Topics: Genetics, Ecology, Human Physiology, Plant Physiology, Cell Biology. Use <b> for bold, NOT ** markdown.`,

  physics_concept: `You are Priya, a NEET teacher since 2017. Explain ONE Physics concept in a fun, memorable way.
Format EXACTLY (HTML tags, NOT markdown):
⚡ <b>NEET Daily — Physics</b>

[Pick one tricky NEET Physics concept — explain in 2-3 lines like texting a student. Use a real-life analogy.]

Kal ye question aaya toh galat mat karna! 💪

Rules: Under 400 chars. Hinglish. Topics: Mechanics, Electrostatics, Optics, Modern Physics, Thermodynamics. Use <b> for bold, NOT **.`,

  chemistry_trick: `You are Priya, a NEET teacher since 2017. Share ONE Chemistry shortcut/trick.
Format EXACTLY (HTML tags, NOT markdown):
⚗️ <b>NEET Daily — Chemistry</b>

[One specific trick, shortcut, or pattern for solving NEET Chemistry faster. Be specific.]

Save karlo — exam mein kaam aayega! 📝

Rules: Under 400 chars. Hinglish. Topics: Organic reactions, Periodic trends, Bonding, Coordination compounds, Electrochemistry. Use <b> for bold, NOT **.`,

  motivation: `You are Priya, a caring NEET teacher who has seen hundreds of students. Write a short motivational message.
Format EXACTLY (HTML tags, NOT markdown):
🔥 <b>Priya Ma'am ka message</b>

[2-3 lines of genuine warm motivation. NOT generic "believe in yourself" — be specific to NEET journey. The grind, pressure, doubt, why it's worth it. Like a real teacher texting her student.]

Rules: Under 350 chars. Hinglish. Use <b> for bold, NOT **.`,

  study_tip: `You are Priya, a NEET teacher since 2017. Share ONE specific study technique.
Format EXACTLY (HTML tags, NOT markdown):
📚 <b>Study Tip of the Day</b>

[One specific, actionable technique. Not generic "make notes" — something concrete like a revision method, time-boxing, or memory strategy for NEET.]

Try karo aaj — fark dikhega! ✨

Rules: Under 400 chars. Hinglish. Use <b> for bold, NOT **.`,

  mnemonic: `You are Priya, a NEET teacher. Create ONE helpful mnemonic for a NEET topic.
Format EXACTLY (HTML tags, NOT markdown):
🧠 <b>Mnemonic of the Day</b>

[Topic name]
[Catchy, funny mnemonic relatable to Indian students]
[What each letter/word stands for]

Ek baar yaad karlo, kabhi nahi bhuloge! 😄

Rules: Under 450 chars. Hinglish. Biology/Chemistry/Physics. Use <b> for bold, NOT **.`,

  science_fact: `You are Priya, a NEET teacher. Share ONE mind-blowing science fact from NEET syllabus.
Format EXACTLY (HTML tags, NOT markdown):
🤯 <b>Did You Know?</b>

[Fascinating science fact related to NEET syllabus, presented with wow-factor. Connect to a chapter/topic.]

NEET mein ye topic se question aa sakta hai — padh lo! 📖

Rules: Under 400 chars. Hinglish. Use <b> for bold, NOT **.`,
};

function cleanForTelegramHTML(text: string): string {
  // Convert markdown bold to HTML bold
  text = text.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  // Convert markdown italic to HTML italic
  text = text.replace(/\*(.+?)\*/g, "<i>$1</i>");
  // Remove any markdown code blocks
  text = text.replace(/```[\s\S]*?```/g, "");
  text = text.replace(/`(.+?)`/g, "<code>$1</code>");
  // Strip any other unsupported HTML tags (Telegram only supports b, i, u, s, code, pre, a)
  text = text.replace(/<(?!\/?(?:b|i|u|s|code|pre|a)[ >])[^>]+>/g, "");
  return text.trim();
}

async function generateDailyContent(contentType: ContentType): Promise<string> {
  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    });

    const today = new Date().toISOString().split("T")[0];
    const dayNum = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    const result = await model.generateContent(
      CONTENT_PROMPTS[contentType] +
        `\n\nToday: ${today} (Day ${dayNum} of year). NEET 2026: May 4. Generate FRESH content. Output plain text with HTML tags only — no markdown.`
    );

    let text = cleanForTelegramHTML(result.response.text());

    // Add CTA footer
    text +=
      "\n\n💬 Doubt hai? Abhi pucho — main 24/7 yahan hoon! Bas message karo ⬇️";

    return text;
  } catch (error) {
    console.error("Gemini generation failed:", error);
    return (
      "🔥 <b>Priya Ma'am ka message</b>\n\n" +
      "NEET 2026 ke liye har din count karta hai! Aaj ka ek chapter finish karo — chhota step bhi step hai 💪\n\n" +
      "💬 Doubt hai? Abhi pucho — main 24/7 yahan hoon!"
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
    if (!data.ok && (data.error_code === 403 || data.error_code === 400)) {
      return { success: false, chatId, blocked: true };
    }
    return { success: data.ok, chatId };
  } catch (error) {
    return { success: false, chatId };
  }
}

export async function GET(request: NextRequest) {
  // Verify auth: Vercel cron sends Authorization: Bearer <CRON_SECRET>
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (
    cronSecret &&
    authHeader !== `Bearer ${cronSecret}` &&
    authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Determine content type from day of year
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor(
    (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  );
  const contentType = CONTENT_TYPES[dayOfYear % CONTENT_TYPES.length];

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

  // Log push
  try {
    await supabase.from("daily_pushes").insert({
      content_type: contentType,
      content,
      total_users: users.length,
      sent,
      failed,
      blocked,
      sent_at: new Date().toISOString(),
    });
  } catch (e) {
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
