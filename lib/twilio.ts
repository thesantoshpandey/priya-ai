import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER!;

// ============================================
// SEND OTP TO PARENT
// ============================================

export async function sendOTP(parentPhone: string, otp: string): Promise<boolean> {
  try {
    // Ensure Indian format
    const formattedPhone = formatIndianPhone(parentPhone);

    await client.messages.create({
      body:
        `[Priya AI] Aapke bachche ne NEET preparation ke liye Priya AI ka use kiya hai. ` +
        `Unka verification code hai: ${otp}\n\n` +
        `Ye code apne bachche ko share karein. ` +
        `Priya AI ek AI-based NEET Biology tutor hai jo aapke bachche ki padhai mein madad karti hai.\n\n` +
        `Agar aapne ye request nahi ki hai toh is message ko ignore karein.`,
      from: TWILIO_PHONE,
      to: formattedPhone,
    });

    return true;
  } catch (error: any) {
    console.error("Twilio SMS error:", error.message);
    return false;
  }
}

// ============================================
// SEND WHATSAPP MESSAGE
// ============================================

export async function sendWhatsAppMessage(to: string, body: string): Promise<boolean> {
  try {
    const formattedPhone = formatIndianPhone(to);

    await client.messages.create({
      body,
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER || TWILIO_PHONE}`,
      to: `whatsapp:${formattedPhone}`,
    });

    return true;
  } catch (error: any) {
    console.error("Twilio WhatsApp error:", error.message);
    return false;
  }
}

// ============================================
// GENERATE OTP
// ============================================

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ============================================
// FORMAT PHONE NUMBER
// ============================================

export function formatIndianPhone(phone: string): string {
  // Strip all non-digits
  const digits = phone.replace(/\D/g, "");

  // If starts with 91 and has 12 digits, it's already +91XXXXXXXXXX
  if (digits.startsWith("91") && digits.length === 12) {
    return `+${digits}`;
  }

  // If 10 digits, add +91
  if (digits.length === 10) {
    return `+91${digits}`;
  }

  // If starts with 0 and has 11 digits, strip 0 and add +91
  if (digits.startsWith("0") && digits.length === 11) {
    return `+91${digits.substring(1)}`;
  }

  // Return as-is with + prefix if not already
  return phone.startsWith("+") ? phone : `+${digits}`;
}

// ============================================
// DETECT PHONE NUMBER IN MESSAGE
// ============================================

export function detectPhoneNumber(message: string): string | null {
  // Match Indian phone patterns
  const patterns = [
    /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/,  // +91 XXXXX XXXXX or XXXXX XXXXX
    /(?:0)?[6-9]\d{9}/,                         // 0XXXXXXXXXX or XXXXXXXXXX
    /\+91\d{10}/,                                // +91XXXXXXXXXX
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      const phone = match[0].replace(/[\s-]/g, "");
      const digits = phone.replace(/\D/g, "");
      // Validate: should have 10 digits (without country code) or 12 (with 91)
      if (digits.length === 10 || (digits.length === 12 && digits.startsWith("91"))) {
        return phone;
      }
    }
  }

  return null;
}
