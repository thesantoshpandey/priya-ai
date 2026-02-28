export default function PrivacyPolicy() {
  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <a href="/" style={styles.backLink}>&larr; Back to Priya AI</a>

        <h1 style={styles.title}>Privacy Policy</h1>
        <p style={styles.updated}>Last updated: 28 February 2026</p>

        <p style={styles.para}>
          Priya AI (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is an AI-powered educational
          tool that helps students prepare for the National Eligibility cum Entrance Test (NEET).
          This Privacy Policy explains how we collect, use, store, and protect your personal data
          in compliance with the Digital Personal Data Protection Act, 2023 (DPDPA 2023) and
          applicable Indian law.
        </p>

        <h2 style={styles.heading}>1. Data We Collect</h2>
        <p style={styles.para}>
          When you use Priya AI through Telegram, WhatsApp, or our voice calling feature, we collect
          the following data: your Telegram or WhatsApp username and chat ID, your name (if you share it),
          your class level and NEET preparation year, your age or date of birth (to determine minor status),
          your chat messages and our responses, your parent or guardian&apos;s phone number (for minors only,
          for the purpose of obtaining verifiable parental consent), and basic usage data such as message
          count and last active time.
        </p>

        <h2 style={styles.heading}>2. Purpose of Data Collection</h2>
        <p style={styles.para}>
          We use your data solely to provide personalized NEET preparation tutoring. Specifically:
          to maintain conversation context so Priya can remember your progress across sessions,
          to tailor explanations to your class level and weak subjects, to comply with legal requirements
          regarding parental consent for users under 18, and to improve our service quality. We do not
          use your data for advertising, marketing to third parties, or any purpose unrelated to your
          NEET preparation.
        </p>

        <h2 style={styles.heading}>3. Children&apos;s Data (Users Under 18)</h2>
        <p style={styles.para}>
          Priya AI is designed for NEET aspirants, many of whom are minors (under 18 years of age).
          In compliance with Section 9 of the DPDPA 2023, we obtain verifiable parental consent before
          processing a minor&apos;s personal data beyond basic academic interaction. When a user is identified
          as a minor, we send a one-time password (OTP) via SMS to their parent or guardian&apos;s phone
          number. The parent must share this OTP with the student to grant consent. Until consent is
          obtained, we restrict the interaction to basic academic queries only and do not collect personal
          or emotional information. We do not track, profile, or serve targeted content to minors. We do
          not engage in any processing that could cause detrimental effect to a child&apos;s wellbeing.
        </p>

        <h2 style={styles.heading}>4. Data Storage and Security</h2>
        <p style={styles.para}>
          Your data is stored on Supabase (cloud database hosted in Asia-Pacific region) with
          row-level security policies. All data transmission occurs over HTTPS/TLS encryption.
          Access to the database is restricted to authenticated service calls only. Admin access
          to user data is logged in an audit trail. We do not store passwords, payment information,
          or government identification numbers.
        </p>

        <h2 style={styles.heading}>5. Data Retention</h2>
        <p style={styles.para}>
          We retain your chat data for as long as you actively use the service. If you have not
          interacted with Priya AI for 12 months, your data will be automatically deleted. You may
          request deletion of your data at any time (see Section 7 below). Parental consent records
          are retained for the duration of the minor&apos;s use of the service plus 1 year for legal
          compliance purposes.
        </p>

        <h2 style={styles.heading}>6. Data Sharing</h2>
        <p style={styles.para}>
          We do not sell, rent, or share your personal data with any third party for commercial
          purposes. Your chat messages are sent to Google Gemini AI for generating responses — Google&apos;s
          API data usage policy applies to this processing. SMS messages for OTP verification are sent
          through Twilio&apos;s messaging service. Voice audio is processed through Cartesia&apos;s text-to-speech
          service. These service providers process data only to provide their specific function and are
          bound by their own privacy policies.
        </p>

        <h2 style={styles.heading}>7. Your Rights Under DPDPA 2023</h2>
        <p style={styles.para}>
          As a Data Principal, you have the following rights: the right to access a summary of your
          personal data and processing activities, the right to correction and erasure of your personal
          data, the right to withdraw consent at any time, and the right to nominate another person to
          exercise your rights. To exercise any of these rights, contact us at the details provided in
          Section 10 below. For minors, these rights may be exercised by the parent or guardian who
          provided consent.
        </p>

        <h2 style={styles.heading}>8. Consent Withdrawal</h2>
        <p style={styles.para}>
          You may withdraw your consent at any time by sending the command /deletedata to the Priya AI
          bot on Telegram or WhatsApp. Upon withdrawal: all your chat history will be permanently deleted,
          your user profile will be removed, any parental consent records will be marked as withdrawn.
          Withdrawal of consent does not affect the lawfulness of processing done prior to withdrawal.
        </p>

        <h2 style={styles.heading}>9. AI Disclosure</h2>
        <p style={styles.para}>
          Priya AI is an artificial intelligence system powered by Google Gemini. While Priya
          communicates in a conversational and friendly manner, it is not a human being. The
          character of &quot;Priya&quot; is a designed persona to make learning engaging. Priya AI does not
          provide medical, legal, or professional counselling advice. If a student expresses signs
          of distress, Priya AI directs them to appropriate human support resources.
        </p>

        <h2 style={styles.heading}>10. Contact Us</h2>
        <p style={styles.para}>
          For any privacy-related queries, data access requests, or complaints, contact us at:
        </p>
        <p style={styles.para}>
          Priya AI (operated by Desi Educators)<br />
          Email: privacy@desieducators.com<br />
          Telegram: @ProfPriyaPandeybot
        </p>

        <h2 style={styles.heading}>11. Grievance Redressal</h2>
        <p style={styles.para}>
          If you are unsatisfied with our response to your privacy concern, you have the right to
          file a complaint with the Data Protection Board of India as established under the DPDPA 2023.
        </p>

        <h2 style={styles.heading}>12. Changes to This Policy</h2>
        <p style={styles.para}>
          We may update this Privacy Policy from time to time. Any changes will be reflected on this
          page with an updated date. Continued use of Priya AI after changes constitutes acceptance
          of the updated policy.
        </p>

        <div style={styles.footer}>
          <p>&copy; 2026 Priya AI by Desi Educators. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "#0f0f1a",
    color: "#e5e7eb",
    padding: "2rem 1rem",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  content: {
    maxWidth: 720,
    margin: "0 auto",
    lineHeight: 1.7,
  },
  backLink: {
    color: "#8b5cf6",
    textDecoration: "none",
    fontSize: 14,
  },
  title: {
    fontSize: 32,
    fontWeight: 700,
    color: "#ffffff",
    marginTop: 16,
    marginBottom: 4,
  },
  updated: {
    fontSize: 13,
    color: "#9ca3af",
    marginBottom: 32,
  },
  heading: {
    fontSize: 20,
    fontWeight: 600,
    color: "#ffffff",
    marginTop: 32,
    marginBottom: 8,
  },
  para: {
    fontSize: 15,
    color: "#d1d5db",
    marginBottom: 16,
  },
  footer: {
    marginTop: 48,
    paddingTop: 24,
    borderTop: "1px solid #374151",
    fontSize: 13,
    color: "#6b7280",
  },
};
