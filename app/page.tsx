export default function Home() {
  return (
    <div style={{ 
      display: "flex", flexDirection: "column", alignItems: "center", 
      justifyContent: "center", minHeight: "100vh", padding: "2rem",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      color: "white", textAlign: "center"
    }}>
      <h1 style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>🧬 Priya AI</h1>
      <p style={{ fontSize: "1.2rem", opacity: 0.9, maxWidth: "500px" }}>
        Your NEET preparation companion. Chat with Priya on Telegram for 
        personalized Biology tutoring, study tips, and mentorship.
      </p>
      <a
        href="https://t.me/YOUR_BOT_USERNAME"
        style={{
          marginTop: "2rem", padding: "1rem 2rem", background: "white",
          color: "#764ba2", borderRadius: "12px", textDecoration: "none",
          fontWeight: "bold", fontSize: "1.1rem",
        }}
      >
        Chat on Telegram →
      </a>
    </div>
  );
}
