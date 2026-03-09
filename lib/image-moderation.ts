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
