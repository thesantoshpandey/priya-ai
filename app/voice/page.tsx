"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ============================================
// PRIYA VOICE CALL PAGE
// ============================================

export default function VoiceCall() {
  const [status, setStatus] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [transcript, setTranscript] = useState("");
  const [messages, setMessages] = useState<Array<{ role: string; text: string }>>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [callActive, setCallActive] = useState(false);

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Get userId from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const uid = params.get("user");
    if (uid) setUserId(uid);
  }, []);

  // Initialize speech recognition
  const startListening = useCallback(() => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      setError("Speech recognition not supported. Use Chrome browser.");
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "hi-IN"; // Hindi + English

    recognition.onstart = () => {
      setStatus("listening");
      setTranscript("");
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      setTranscript(finalTranscript || interimTranscript);

      if (finalTranscript) {
        handleUserMessage(finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech error:", event.error);
      if (event.error === "no-speech") {
        // Restart if no speech detected
        if (callActive) startListening();
      } else {
        setStatus("idle");
      }
    };

    recognition.onend = () => {
      // Auto-restart if call is active and not processing
      if (callActive && status === "listening") {
        try { recognition.start(); } catch (e) {}
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [callActive, status]);

  // Handle user's spoken message
  const handleUserMessage = async (text: string) => {
    if (!userId || !text.trim()) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setStatus("thinking");

    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, text }),
      });

      const data = await res.json();

      if (data.text) {
        setMessages((prev) => [...prev, { role: "priya", text: data.text }]);
      }

      // Play audio if available
      if (data.audio) {
        setStatus("speaking");
        const audioBlob = new Blob(
          [Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0))],
          { type: "audio/mp3" }
        );
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onended = () => {
          setStatus("listening");
          if (callActive) startListening();
        };

        audio.play();
      } else {
        // No audio — use browser TTS as fallback
        setStatus("speaking");
        const utterance = new SpeechSynthesisUtterance(data.text);
        utterance.lang = "hi-IN";
        utterance.rate = 1.1;
        utterance.onend = () => {
          setStatus("listening");
          if (callActive) startListening();
        };
        window.speechSynthesis.speak(utterance);
      }
    } catch (err) {
      console.error("Voice API error:", err);
      setError("Connection error. Try again.");
      setStatus("idle");
    }
  };

  // Start/end call
  const toggleCall = () => {
    if (callActive) {
      // End call
      setCallActive(false);
      setStatus("idle");
      recognitionRef.current?.stop();
      audioRef.current?.pause();
      window.speechSynthesis.cancel();
    } else {
      // Start call
      setCallActive(true);
      setError(null);
      startListening();
    }
  };

  // Status display
  const statusText: Record<string, string> = {
    idle: "Tap to call Priya",
    listening: "Listening...",
    thinking: "Priya is thinking...",
    speaking: "Priya is speaking...",
  };

  const statusColor: Record<string, string> = {
    idle: "#6b7280",
    listening: "#22c55e",
    thinking: "#f59e0b",
    speaking: "#8b5cf6",
  };

  if (!userId) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🧬</div>
          <h1 style={styles.title}>Priya AI Voice</h1>
          <p style={styles.subtitle}>
            Voice call feature is available through your Telegram chat.
            Ask Priya for the voice call link!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Priya Avatar */}
        <div style={{
          ...styles.avatar,
          boxShadow: callActive ? `0 0 30px ${statusColor[status]}40` : "none",
          borderColor: statusColor[status],
        }}>
          <span style={{ fontSize: 48 }}>🧬</span>
        </div>

        <h1 style={styles.title}>Priya</h1>
        <p style={{ ...styles.status, color: statusColor[status] }}>
          {statusText[status]}
        </p>

        {/* Transcript */}
        {transcript && status === "listening" && (
          <div style={styles.transcript}>
            &ldquo;{transcript}&rdquo;
          </div>
        )}

        {/* Call button */}
        <button
          onClick={toggleCall}
          style={{
            ...styles.callButton,
            backgroundColor: callActive ? "#ef4444" : "#22c55e",
          }}
        >
          {callActive ? "End Call" : "Call Priya"}
        </button>

        {error && <p style={styles.error}>{error}</p>}

        {/* Chat history */}
        <div style={styles.messagesContainer}>
          {messages.slice(-6).map((msg, i) => (
            <div
              key={i}
              style={{
                ...styles.messageBubble,
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                backgroundColor: msg.role === "user" ? "#3b82f6" : "#374151",
              }}
            >
              <p style={styles.messageText}>{msg.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// STYLES
// ============================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0f0f23 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: 400,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #8b5cf6, #a855f7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "3px solid #6b7280",
    transition: "all 0.3s ease",
  },
  title: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: 700,
    margin: 0,
  },
  subtitle: {
    color: "#9ca3af",
    fontSize: 14,
    textAlign: "center" as const,
    lineHeight: 1.5,
  },
  status: {
    fontSize: 14,
    fontWeight: 500,
    margin: 0,
    transition: "color 0.3s ease",
  },
  transcript: {
    color: "#d1d5db",
    fontSize: 14,
    fontStyle: "italic",
    textAlign: "center" as const,
    padding: "8px 16px",
    background: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    maxWidth: "90%",
  },
  callButton: {
    width: 80,
    height: 80,
    borderRadius: "50%",
    border: "none",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    transition: "all 0.2s ease",
    boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
    marginTop: 8,
  },
  error: {
    color: "#ef4444",
    fontSize: 13,
    margin: 0,
  },
  messagesContainer: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 16,
    maxHeight: 200,
    overflowY: "auto" as const,
  },
  messageBubble: {
    maxWidth: "80%",
    padding: "8px 14px",
    borderRadius: 16,
  },
  messageText: {
    color: "#ffffff",
    fontSize: 13,
    margin: 0,
    lineHeight: 1.4,
  },
};
