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
        `\n\nToday: ${today} (Day ${dayNum} of year). NEET 2026: May 3 (Sunday). Generate FRESH content. Output plain text with HTML tags only — no markdown.`
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

  // ============================================
  // EXAM-DAY + POST-EXAM OVERRIDE — NEET 2026 (May 3) and aftermath
  //
  // The week after NEET is the most fragile phase. Students cry, compare
  // answer keys, spiral into "I have ruined my life" thinking. The push
  // must NOT mention rank, score, answer keys, or "how did it go" — it
  // must be calm, validating, no-panic, no-comparison. Just blessings
  // and the message: "you are okay, whatever happened."
  //
  // After May 9 the bot returns to normal rotating content.
  // ============================================
  const nowIST = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
  const istDateKey =
    nowIST.getFullYear() +
    "-" +
    String(nowIST.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(nowIST.getDate()).padStart(2, "0");

  const NEET_PHASE_OVERRIDES: Record<string, string> = {
    // Exam day — heading to centre
    "2026-05-03":
      "🌅 <b>Aaj ka din hai, bachon</b>\n\n" +
      "Bas itna karo: deep breath lo, paani piyo, admit card aur ID dobara check kar lo. " +
      "Centre 11 baje se 1:30 baje tak open hai — time se pahuncho.\n\n" +
      "Naya kuch nahi padhna. Jo aata hai woh bahut kaafi hai. " +
      "Paper milte hi 30 second pura scan karo — strong questions pehle, kamzor ones baad mein. " +
      "Galat pe -1 hai, isliye sirf wahi tick karo jo pakka aata hai.\n\n" +
      "Mera ashirwad tumhare saath hai. Tum ye kar sakte ho. 💜\n\n" +
      "— Priya Ma'am",

    // Day after — answer keys floating around, peers comparing
    "2026-05-04":
      "💜 <b>Kaise ho aaj?</b>\n\n" +
      "Paper jaisa bhi gaya, ek baat sun lo: <b>jo ho gaya woh ho gaya</b>. " +
      "Aaj answer key mat dekho. Doston se compare mat karo. " +
      "Social media par jo log apne 'pakka 700+' bata rahe hain — woh tumhari kahaani nahi hai.\n\n" +
      "Aaj sirf aaram. Achha khaana, lambi neend, family ke saath thoda time. " +
      "Tum kal jisne paper diya, woh ek bahaadur insaan hai. Apne aap ko thanks bolo.\n\n" +
      "Main yahin hoon. Kuch bhi baat karni ho — bas message kar dena. 💜\n\n" +
      "— Priya Ma'am",

    // Two days after — the "what if" spiraling starts
    "2026-05-05":
      "💜 <b>Ek choti baat</b>\n\n" +
      "Agar aaj dimaag mein 'ye galat ho gaya', 'woh galat ho gaya' chal raha hai — ye normal hai. " +
      "Har serious student ke saath hota hai. Tum akele nahi ho.\n\n" +
      "Lekin yaad rakho: <b>NEET ek exam hai, tumhari zindagi nahi</b>. " +
      "Result aane mein time hai. Jo ho chuka, usse abhi badla nahi ja sakta. " +
      "Toh us pe energy waste karne ka koi matlab nahi.\n\n" +
      "Aaj kuch karo jo tumhe khushi de — kisi se baat, kuch achha khaana, ya bas thodi der dhoop mein baith jao.\n\n" +
      "— Priya Ma'am 💜",

    // Three days after — re-anchoring
    "2026-05-06":
      "💜 <b>Tum theek ho</b>\n\n" +
      "Kuch students ko paper achha laga, kuch ko bura. Dono normal hain. " +
      "Dono hi situations mein, agla step same hai: <b>aaram karo aur intezaar karo</b>.\n\n" +
      "Ek aur baat: agar ghar mein log baar baar pooch rahe hain 'kaisa hua', " +
      "toh seedha bol do — \"theek hua, result aane do, phir baat karenge.\" Bas. " +
      "Tumhe har kisi ko jawab dene ki zaroorat nahi hai.\n\n" +
      "Apna khayal rakhna sabse important hai abhi. — Priya Ma'am 💜",

    // Four days after — looking forward gently
    "2026-05-07":
      "💜 <b>Aage ka soch rahe ho?</b>\n\n" +
      "Kuch bachhon ke dimaag mein abhi se 'agar nahi hua toh dropper banoonga ya nahi' chal raha hai. " +
      "Aisa kuch faisla abhi mat lo. Result aane do. <b>Information ke baad decision lena, panic mein nahi.</b>\n\n" +
      "Jin students ne paper diya — chahe achha gaya ya na — tum sab winner ho. " +
      "Itna bada exam attempt karna hi badi baat hai. Ye baat bhulna mat.\n\n" +
      "Main yahan hoon — NEET 2026 ke liye, NEET 2027 ke liye, ya bas baat karne ke liye. " +
      "— Priya Ma'am 💜",

    // Five days after
    "2026-05-08":
      "💜 <b>Routine wapas le aao</b>\n\n" +
      "Paanch din ho gaye. Agar abhi tak neend kharab hai, ya khaane ka mann nahi, ya " +
      "har waqt result ki tension hai — ye normal hai, lekin isse pakadne ki zaroorat nahi.\n\n" +
      "Aaj ek choti si cheez karo: subah ka time fix karo, ek meal proper khao, " +
      "20 minute walk pe jao. Body theek hogi toh dimaag bhi theek hoga.\n\n" +
      "Result jab aayega tab dekhenge. Ab tak — tum apna khayal rakho. — Priya Ma'am 💜",

    // Six days after
    "2026-05-09":
      "💜 <b>Ek hafta ho gaya</b>\n\n" +
      "NEET diye ek hafta ho gaya. Kuch students ne move on kar liya, kuch abhi bhi atke hain. " +
      "Dono okay hai. Apni speed se chalo.\n\n" +
      "Agar koi friend ya classmate bahut down lag raha hai — usse message karo. " +
      "Sirf 'kaisa hai bhai' bhi kaafi hota hai. Iss waqt aap log ek dusre ke liye sabse zyada matter karte ho.\n\n" +
      "Mera yahan hona kabhi nahi rukta. Kuch bhi pucho — padhai, life, ya bas baat karne ke liye. — Priya Ma'am 💜",
  };

  let content: string;
  if (NEET_PHASE_OVERRIDES[istDateKey]) {
    content = NEET_PHASE_OVERRIDES[istDateKey];
  } else {
    // Normal day — rotate by day of year
    const start = new Date(nowIST.getFullYear(), 0, 0);
    const dayOfYear = Math.floor(
      (nowIST.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );
    const contentType = CONTENT_TYPES[dayOfYear % CONTENT_TYPES.length];
    content = await generateDailyContent(contentType);
  }

  // Get all users
  const { data: users, error } = await supabase
    .from("users")
    .select("id, telegram_chat_id")
    .or("bot_blocked.is.null,bot_blocked.eq.false");

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
      else if (result.blocked) {
        blocked++;
        // Mark user as blocked so we skip them next time
        try {
          await supabase
            .from("users")
            .update({ bot_blocked: true })
            .eq("id", user.id);
        } catch (e) {}
      }
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
