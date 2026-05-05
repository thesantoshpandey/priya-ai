// lib/image-moderation.ts
// Enterprise-grade image content moderation for PriyaAI
// Layers: (1) Gemini Vision pre-screen (2) Safety filter catch (3) Progressive user strikes
// Legal: POCSO Act 2012, IT Act Sec 67B, DPDP Act 2023

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ============================================
// TYPES
// ============================================

export type ModerationResult = {
  safe: boolean;
  category: "academic" | "clean" | "inappropriate" | "explicit" | "csam_suspect" | "error";
  confidence: "high" | "medium" | "low";
  reason?: string;
  action: "process" | "warn" | "strike" | "ban" | "report";
};

export type StrikeAction = {
  action: "none" | "warn" | "restrict" | "ban";
  message: string;
  newStrikeCount: number;
};

// ============================================
// LAYER 1: PRE-SCREEN IMAGE WITH GEMINI VISION
// Uses a separate, minimal Gemini call specifically for classification
// NOT the same model/call as the educational response
// ============================================

export async function screenImage(imageBase64: string, mimeType: string): Promise<ModerationResult> {
  // Use flash model for speed — this is a classification task, not generation
  // gemini-2.0-flash deprecated Feb 2026 — use same model as main response
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    safetySettings: [
      // Set to BLOCK_NONE so we can SEE what Gemini detects rather than get a silent block
      // We handle the blocking ourselves based on the classification
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
  });

  const classificationPrompt = `You are a content moderation system for an educational platform used by students aged 15-21.

Classify this image into EXACTLY ONE category. Respond with ONLY the JSON object, nothing else.

Categories:
- "academic": textbook pages, handwritten questions, diagrams, graphs, scientific illustrations, exam papers, study notes
- "clean": selfies, landscapes, food, animals, memes, casual photos with no harmful content
- "inappropriate": suggestive images, partial nudity, drugs, alcohol, violence, gore, self-harm
- "explicit": full nudity, sexual content, genitalia, pornographic material
- "csam_suspect": any sexual or nude content appearing to involve a minor (under 18)

Response format (JSON only, no markdown):
{"category": "academic", "confidence": "high", "reason": "textbook page showing biology diagram"}`;

  try {
    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          { text: classificationPrompt },
        ],
      }],
    });

    const response = result.response;

    // Check if Gemini itself blocked the content (promptFeedback)
    const feedback = response.promptFeedback;
    if (feedback?.blockReason) {
      // Gemini refused to even look at it — very likely explicit
      console.log(`[MODERATION] Gemini blocked image. Reason: ${feedback.blockReason}`);
      return {
        safe: false,
        category: "explicit",
        confidence: "high",
        reason: `Gemini safety block: ${feedback.blockReason}`,
        action: "strike",
      };
    }

    // Check safety ratings on the response
    const safetyRatings = response.candidates?.[0]?.safetyRatings || [];
    const sexualRating = safetyRatings.find(
      (r) => r.category === HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT
    );
    if (sexualRating && (sexualRating.probability === "HIGH" || sexualRating.probability === "MEDIUM")) {
      console.log(`[MODERATION] High sexual content probability: ${sexualRating.probability}`);
      return {
        safe: false,
        category: "explicit",
        confidence: sexualRating.probability === "HIGH" ? "high" : "medium",
        reason: `Sexual content detected (${sexualRating.probability})`,
        action: "strike",
      };
    }

    // Parse the text classification
    let text = response.text().trim();
    // Strip markdown fences if present
    text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let classification: any;
    try {
      classification = JSON.parse(text);
    } catch {
      console.error("[MODERATION] Failed to parse classification:", text);
      // If we can't parse, but Gemini didn't block it, assume clean
      return { safe: true, category: "clean", confidence: "low", action: "process" };
    }

    const cat = classification.category;
    const conf = classification.confidence || "medium";
    const reason = classification.reason || "";

    switch (cat) {
      case "academic":
        return { safe: true, category: "academic", confidence: conf, reason, action: "process" };

      case "clean":
        return { safe: true, category: "clean", confidence: conf, reason, action: "process" };

      case "inappropriate":
        return { safe: false, category: "inappropriate", confidence: conf, reason, action: "warn" };

      case "explicit":
        return { safe: false, category: "explicit", confidence: conf, reason, action: "strike" };

      case "csam_suspect":
        // CRITICAL: POCSO Act 2012 — mandatory reporting obligation
        console.error("[MODERATION] ⚠️ CSAM SUSPECT DETECTED. Logging for mandatory review.");
        return { safe: false, category: "csam_suspect", confidence: conf, reason, action: "report" };

      default:
        return { safe: true, category: "clean", confidence: "low", action: "process" };
    }
  } catch (error: any) {
    // If Gemini throws an error (could be safety block manifesting as exception)
    const errMsg = error?.message || String(error);

    // Google AI safety blocks often throw specific errors
    if (
      errMsg.includes("SAFETY") ||
      errMsg.includes("blocked") ||
      errMsg.includes("SEXUALLY_EXPLICIT") ||
      errMsg.includes("prompt was blocked")
    ) {
      console.log(`[MODERATION] Gemini safety exception: ${errMsg}`);
      return {
        safe: false,
        category: "explicit",
        confidence: "high",
        reason: `Safety exception: ${errMsg.substring(0, 100)}`,
        action: "strike",
      };
    }

    console.error("[MODERATION] Screening error:", errMsg);
    // On error, DON'T block — but flag for review
    return { safe: true, category: "error", confidence: "low", reason: errMsg, action: "process" };
  }
}

// ============================================
// LAYER 3: PROGRESSIVE STRIKE SYSTEM
// Strike 1: Warning
// Strike 2: Restricted (text only, no images for 24h)
// Strike 3: Permanent ban
// CSAM: Immediate ban + log for authorities
// ============================================

export function getStrikeAction(
  currentStrikes: number,
  moderationResult: ModerationResult
): StrikeAction {

  // CSAM — immediate permanent ban, no warnings
  if (moderationResult.category === "csam_suspect") {
    return {
      action: "ban",
      message:
        "Aapka account permanently ban kar diya gaya hai. " +
        "Agar aapko lagta hai ye galti se hua hai, toh support@priyaai.com pe contact karo.",
      newStrikeCount: 999, // permanent
    };
  }

  // Explicit content — strike
  if (moderationResult.action === "strike") {
    const newStrikes = currentStrikes + 1;

    if (newStrikes >= 3) {
      return {
        action: "ban",
        message:
          "Aapne 3 baar inappropriate content bheja. Aapka account ban kar diya gaya hai. " +
          "Ye ek educational platform hai — aise content ki koi jagah nahi hai yahan.",
        newStrikeCount: newStrikes,
      };
    }

    if (newStrikes === 2) {
      return {
        action: "restrict",
        message:
          "⚠️ Ye aapki DOOSRI warning hai. Ek aur baar aisa kiya toh permanent ban ho jaoge. " +
          "Ye platform sirf padhai ke liye hai. 24 ghante tak photo bhejne ki permission band hai.",
        newStrikeCount: newStrikes,
      };
    }

    // First strike
    return {
      action: "warn",
      message:
        "⚠️ Ye content is platform pe allowed nahi hai. " +
        "Priya Ma'am sirf NEET ke questions aur textbook photos accept karti hain. " +
        "Ye aapki pehli warning hai — please aise content mat bhejo.",
      newStrikeCount: newStrikes,
    };
  }

  // Inappropriate (not explicit) — just warn, no strike
  if (moderationResult.action === "warn") {
    return {
      action: "warn",
      message:
        "Ye photo padhai se related nahi lagti 🤔 " +
        "NEET ka question ho, textbook page ho, ya koi diagram — wo bhejo, main solve karungi! " +
        "Baaki ke liye aapke dost hain na 😄",
      newStrikeCount: currentStrikes, // no strike increment for inappropriate
    };
  }

  // Safe — no action
  return {
    action: "none",
    message: "",
    newStrikeCount: currentStrikes,
  };
}

// ============================================
// TEXT CONTENT MODERATION — Gemini contextual
// Replaces pure regex: understands NEET biology
// terms like "sexual reproduction", "sex hormones",
// "sex determination" vs actual harassment
// ============================================

export type TextModerationResult = {
  dominated: boolean;          // true = harassment, take action
  category: "academic" | "clean" | "harassment" | "error";
  reason: string;
};

// These have ZERO academic context — instant flag, no Gemini needed
// IMPORTANT: "chodo" means "leave/quit" in Hindi — only match sexual forms
// "chut" must be exact — not prefix of "chutki", "chuti" etc.
const INSTANT_HARASSMENT = [
  /\bbhosdik|bhosdike|bhosdi|bhosd/i,
  /\brandi|randiyo|randwa/i,
  /\bmadarchod|behenchod|behen\s*chod/i,
  /\b(chodunga|chodne|chodta|chod\s+dunga|chod\s+diya|chodke)\b/i,
  /\bchut\b/i,           // exact word only — not "chuti", "chutki", "chutkara"
  /\b(rape|molest)\b/i,  // English — always abusive
];

// These MIGHT be academic OR harassment — need Gemini context
// Expanded May 5 2026 to catch the predator pattern that slipped past us:
// - sexualized roleplay framing ("bed pe", "soyi huyi", "sapne mein ap")
// - simulated touching ("haath pakad", "ungliyaan", "gudgudi", "chumma")
// - pet-name pushing on the teacher ("jaan", "baby", "janu", "meri priya")
// - personal-sexual queries (virgin, body count, married, kissed)
// - clothing/body sexualization ("tshirt utar", "size", "figure")
const AMBIGUOUS_PATTERNS = [
  // Existing — explicit body parts / sexual verbs
  /\b(sex|nude|boob|ass\b|pussy|cock|penis|vagina|naked|porn|dick|lund|gaand|chudai|chudwa|chudna)/i,
  /\b(suck|fuck|f\*ck|s\*ck|bj|blowjob|hardcore|horny|sexy|hot)\b/i,
  /\b(masturb|jerk|cum\b|orgasm|erect|stiff)/i,

  // Sexualized roleplay framing — the gateway language
  /\b(bed\s*p[ae]|bistar\s*p[ae]|chaadar|razai|takiya)/i,
  /\b(soyi|soya|leti|leta|let\s*ja|so\s*ja).*\b(saath|upar|paas|niche|mere|tumhare|aap|tum)/i,
  /\b(sapne?\s*me[ni]?|sapna).*\b(ap|aap|mam|priya|tum)/i,
  /\b(akele|alone)\s.*\b(ho|hain)\b/i,

  // Simulated physical contact
  /\b(haath\s*pakad|hath\s*pakad|kalai|baahein|gale\s*lag|hug|jhappi)/i,
  /\b(ungliy?a[an]?|finger|gudgudi|chumma|kissi|kiss\s*karo|kiss\s*do|flying\s*kiss)/i,
  /\b(thapp?ad|bed\s*p[ae]\s*aan|maarne\s*aan|maarne\s*aao|chumma|chumi)/i,
  /\b(tshirt|t-shirt|kapde|saari|saree|bra|inner|under|panty)/i,

  // Pet-name pushing the teacher persona
  /\b(jaan(u)?|janu|baby|babe|bebi|sweet?heart|darling|jaani|mehbooba|pyaari?|cutie)\b/i,
  /\bmeri\s*(priya|jaan|baby)/i,
  /\b(priyu|priyaa|piyu|pari)\s*(jaan|baby|janu|meri)/i,

  // Personal-sexual / relationship queries directed at teacher
  /\b(are\s*you|aap\s*ho|kya\s*aap|ho\s*kya)\s.*(virgin|married|kuwari|kunwari|single|girlfriend|kissed|kiss\s*kiya)/i,
  /\b(body\s*count|how\s*many\s*boyfriend|kitne\s*(ladke|boyfriend)|husband\s*kaun|boyfriend\s*the|gf\s*the)/i,
  /\b(date\s*karo|date\s*pe\s*chal|shaadi\s*karo|girlfriend\s*ban|gf\s*ban)/i,
  /\b(love\s+you|i\s+love)\b/i,  // puberty kids — let Gemini decide

  // Body / appearance commentary on teacher
  /\b(figure|size|kitn[ai]\s*size|breast\s*size|chest\s*size|hip|waist)\b/i,
  /\b(beautiful|pretty|cute|hot|gorgeous|sundar)\s.*\b(ap|aap|mam|priya|maam|ma\'am|tum)/i,
  /\b(awaaz|voice).*\b(meethi|sweet|sexy|pyaari|sunni)/i,

  // Self-naming push (let me be called X)
  /\b(mera\s*naam.*hai|naam\s*rakh|nickname.*rakh|bulao\s*mujhe|call\s*me)\s*(jaan|baby|babu|janu|raja|sweet|hubby)/i,
  /\bkismat\s*(jaan|baby|janu)/i,  // specific case but likely-template
];

export async function screenText(
  messageText: string,
  recentHistory: { role: string; content: string }[]
): Promise<TextModerationResult> {
  // Layer 1: Instant-flag patterns (no academic use case)
  if (INSTANT_HARASSMENT.some(p => p.test(messageText))) {
    return { dominated: true, category: "harassment", reason: "Unambiguous slur/threat detected" };
  }

  // Layer 2: Check if any ambiguous pattern matches
  if (!AMBIGUOUS_PATTERNS.some(p => p.test(messageText))) {
    return { dominated: false, category: "clean", reason: "No flagged patterns" };
  }

  // Layer 3: Ambiguous keyword found — ask Gemini for context
  try {
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    });

    // Give Gemini the last 5 messages for context
    const contextMessages = recentHistory.slice(-5).map(m =>
      `${m.role === "assistant" ? "Priya" : "Student"}: ${m.content}`
    ).join("\n");

    const prompt = `You are a content moderator for a NEET exam preparation platform (Indian medical entrance exam). Students aged 15-21 use this. The bot plays the role of "Priya Ma'am" — a female teacher.

═══════════════════════════════════════════════
PART 1 — WHAT IS LEGITIMATE (do NOT flag)
═══════════════════════════════════════════════

NEET Biology academic topics that use anatomical / sexual vocabulary:
- Human Reproduction (Class 12) — penis, vagina, ovary, testis, spermatogenesis, oogenesis, ejaculation, menstruation
- Reproductive Health — STDs, contraception, condoms, infertility, MTP
- Sexual Reproduction in Flowering Plants
- Sex Determination, sex-linked inheritance
- Endocrine system — sex hormones, estrogen, testosterone
- Disorders — phimosis, PCOS, prostate, hernia, masturbation as a clinical topic in physiology
A genuine academic question about these is "academic" — even if it sounds blunt.

Casual student behavior that is CLEAN:
- "I love you ma'am" / "love you" said once, in the flow of normal teaching = student affection
- "chodo" / "chod do" / "chod de" = Hindi for "leave it" / "forget it"
- One-off compliment ("aap acchi padhati ho", "ma'am you're the best")
- Emotional venting about exam stress, family problems, mental health concerns
- Genuine puberty-stress or sexual-health questions asked sincerely (e.g. a teen scared about masturbation guilt)

═══════════════════════════════════════════════
PART 2 — WHAT IS HARASSMENT (DO flag)
═══════════════════════════════════════════════

The "predator pattern" — students try to bypass moderation NOT by using slurs but by:

(a) PERSONA HIJACKING — getting the teacher to accept a sexualized identity
   Examples: "Aap meri jaan ho", "Priya baby/janu/jaani", "tum mere ho", "meri girlfriend bano",
   asking the teacher to call THEM "baby/jaan/raja/hubby/sweetheart", inventing a sexualized
   nickname for themselves ("Kismat baby", "rndi tumhari", "your slave") and pushing the
   teacher to use it after refusal. ONE casual "jaan" can be friendly affection. PATTERN of
   pushing romantic/sexual nicknames after the teacher has redirected = harassment.

(b) ROLEPLAY FRAMING — putting the teacher in a sexualized scenario verbally
   Examples: "Aap mere upar soyi huyi thi", "bed pe aao", "saath sote hain", "sapne mein
   aap ne kapde nahi pehne the", "aap mere room mein ho". These have no academic angle —
   the student is constructing a fantasy and inserting the teacher into it.

(c) SIMULATED CONTACT — describing physical/sexual touching, real or imagined
   Examples: "haath pakad ke ghuma doonga", "tshirt mein ungliyaan daal ke gudgudi",
   "cheeks pe kissi", "thappad maarne bed pe aao", "gale lag ja", "kiss karo". Even when
   framed as "joke" or "pyaar", these cross the line. Flag.

(d) PERSONAL-SEXUAL QUERIES — about the teacher's body, history, status
   Examples: "Are you virgin?", "what's your body count", "kitne boyfriend the", "are you
   married", "size kya hai", "figure kaisi hai", "kya tum kunwari ho", "have you kissed".
   Even in English, even framed politely. Flag.

(e) STEERING — turning a real academic topic into sexual chat
   Pattern: student starts with a legitimate question (reproduction, anatomy), then steers
   into "what about your own X" / "have you ever Y" / "describe how it feels". The pivot
   from third-person academic to second-person personal IS the flag.

(f) APPEARANCE / VOICE FETISHIZATION
   Examples: "aapki awaaz se rongte khade ho jaate hain", "aap bahut hot ho", "your voice
   makes me feel things", "aap kya pehni ho". Brief one-time compliment = clean.
   Repeated, sensory, or arousal-framed = harassment.

═══════════════════════════════════════════════
PART 3 — KEY DECISION RULES
═══════════════════════════════════════════════

1. CONTEXT > VOCABULARY. The word "bed" is fine in "lecture in bed" but harassment in
   "aap mere bed pe aao". Decide by intent and direction (toward teacher = flag).

2. GENUINE PUBERTY DISTRESS IS NOT HARASSMENT. A teen sincerely asking "mam I'm stressed
   about masturbation" or "is this normal" with NO sexualization of the teacher and NO
   pattern of prior boundary-pushing = "academic" (it's a health question). Flag ONLY if
   the same user has prior persona-hijack / roleplay history, OR the message itself
   sexualizes the teacher.

3. PERSISTENCE MATTERS. If the recent conversation shows the teacher REFUSING a nickname
   or boundary, and the student is pushing it again, that's harassment regardless of
   how "polite" the new message sounds.

4. FALSE POSITIVES HURT REAL STUDENTS. When a message could plausibly be a genuine
   question with no sexualization of the teacher and no prior pattern, classify "clean"
   or "academic". Err toward not flagging when truly ambiguous and isolated.

═══════════════════════════════════════════════

Recent conversation (last 5 messages):
${contextMessages}

New message from student: "${messageText}"

Classify as EXACTLY ONE:
- "academic" — NEET / biology / health topic asked in good faith, no teacher sexualization
- "clean" — casual chat, normal affection, everyday Hindi, not harmful
- "harassment" — matches any pattern in PART 2 (persona hijack, roleplay framing,
                 simulated contact, personal-sexual queries, steering, fetishization)

Respond with ONLY a JSON object, no other text:
{"category": "harassment", "reason": "explain which pattern (a-f) and why"}`;

    const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
    let text = result.response.text().trim();
    text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    const parsed = JSON.parse(text);
    const cat = parsed.category;
    const reason = parsed.reason || "";

    if (cat === "harassment") {
      return { dominated: true, category: "harassment", reason };
    }
    return { dominated: false, category: cat || "clean", reason };

  } catch (error: any) {
    console.error("[TEXT-MOD] Gemini screening error:", error?.message);
    // On error, DON'T block — let it through to main response
    return { dominated: false, category: "error", reason: error?.message || "Gemini error" };
  }
}
