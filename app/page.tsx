export default function Home() {
  return (
    <div style={{
      display: "flex", flexDirection: "column" as const, alignItems: "center",
      justifyContent: "center", minHeight: "100vh", padding: "2rem",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      color: "white", textAlign: "center" as const,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <h1 style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>🧬 Priya AI</h1>
      <p style={{ fontSize: "1.2rem", opacity: 0.9, maxWidth: "500px", lineHeight: 1.6 }}>
        Your NEET preparation companion. Chat with Priya on Telegram for
        personalized Biology tutoring, study tips, and mentorship.
      </p>
      <a
        href="https://t.me/ProfPriyaPandeybot"
        style={{
          marginTop: "2rem", padding: "1rem 2rem", background: "white",
          color: "#764ba2", borderRadius: "12px", textDecoration: "none",
          fontWeight: "bold", fontSize: "1.1rem",
        }}
      >
        Chat on Telegram →
      </a>
      <div style={{ marginTop: "3rem", fontSize: "0.85rem", opacity: 0.7 }}>
        <a href="/privacy" style={{ color: "white", textDecoration: "underline" }}>
          Privacy Policy
        </a>
        <span style={{ margin: "0 0.5rem" }}>·</span>
        <span>By Desi Educators</span>
      </div>
    </div>
  );
}
