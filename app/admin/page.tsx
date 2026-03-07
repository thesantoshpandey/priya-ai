"use client";

import { useState, useEffect, useCallback } from "react";

interface User {
  id: string;
  name: string | null;
  telegram_username: string | null;
  preferred_language: string | null;
  message_count: number;
  last_message_at: string;
  daily_text_count: number;
  daily_voice_count: number;
  daily_image_count: number;
}

interface Stats {
  totalUsers: number;
  activeToday: number;
  active7d: number;
  totalMessages: number;
  totalVoice: number;
  totalImages: number;
  bounced: number;
  powerUsers: number;
  chats24h: number;
}

interface Chat {
  id: string;
  role: string;
  content: string;
  created_at: string;
  tokens_used: number | null;
  model_used: string | null;
}

interface VoiceMessage {
  id: string;
  content_flag: string;
  flagged_reason: string | null;
  ai_response: string | null;
  file_size_bytes: number | null;
  created_at: string;
  users: { name: string | null; telegram_username: string | null } | null;
}

const LIMITS = { text: 100, voice: 10, image: 20 };

const langLabel: Record<string, string> = {
  hinglish: "Hinglish", hindi: "Hindi", tamil: "Tamil", kannada: "Kannada", telugu: "Telugu",
  malayalam: "Malayalam", bengali: "Bengali", marathi: "Marathi", gujarati: "Gujarati",
  punjabi: "Punjabi", english: "English", odia: "Odia", urdu: "Urdu", assamese: "Assamese",
  unknown: "Not set",
};

function timeAgo(d: string | null) {
  if (!d) return "—";
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function AdminDashboard() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [tab, setTab] = useState("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [langStats, setLangStats] = useState<{ lang: string; cnt: number }[]>([]);
  const [voiceMessages, setVoiceMessages] = useState<VoiceMessage[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/dashboard", {
        headers: { Authorization: `Bearer ${password}` },
      });
      if (!res.ok) throw new Error("Unauthorized");
      const data = await res.json();
      setStats(data.stats);
      setUsers(data.users);
      setLangStats(data.langStats);
      setVoiceMessages(data.voiceMessages);
      setAuthenticated(true);
      setError("");
    } catch {
      setError("Wrong password or server error");
    }
    setLoading(false);
  }, [password]);

  const loadChats = async (user: User) => {
    setSelectedUser(user);
    try {
      const res = await fetch(`/api/admin/chats/${user.id}`, {
        headers: { Authorization: `Bearer ${password}` },
      });
      const data = await res.json();
      setChats(data.chats || []);
    } catch {
      setChats([]);
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return !q || (u.name || "").toLowerCase().includes(q) ||
      (u.telegram_username || "").toLowerCase().includes(q) ||
      (u.preferred_language || "").toLowerCase().includes(q);
  });

  // Login
  if (!authenticated) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: "#F8F9FA", fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", maxWidth: "380px", width: "100%", padding: "0 24px" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "16px", background: "linear-gradient(135deg, #E8384F, #D63384)",
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px",
            fontSize: "28px", color: "#fff", fontWeight: 800 }}>P</div>
          <h1 style={{ color: "#1A1A2E", fontSize: "22px", fontWeight: 700, margin: "0 0 6px" }}>Priya AI</h1>
          <p style={{ color: "#6B7280", margin: "0 0 28px", fontSize: "14px" }}>Admin Dashboard</p>
          <input type="password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchDashboard()}
            placeholder="Enter password"
            style={{ width: "100%", padding: "14px 18px", background: "#fff",
              border: "1px solid #E5E7EB", borderRadius: "10px", color: "#1F2937",
              fontSize: "15px", marginBottom: "14px", outline: "none", boxSizing: "border-box",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
          />
          <button onClick={fetchDashboard} disabled={loading}
            style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg, #E8384F, #D63384)",
              color: "#fff", border: "none", borderRadius: "10px", fontSize: "15px", fontWeight: 600,
              cursor: "pointer", opacity: loading ? 0.7 : 1, boxShadow: "0 2px 8px rgba(232,56,79,0.3)" }}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
          {error && <p style={{ color: "#DC2626", marginTop: "14px", fontSize: "13px" }}>{error}</p>}
        </div>
      </div>
    );
  }

  const tabs = ["overview", "students", "chats", "voice", "languages"];
  const tabStyle = (t: string) => ({
    padding: "12px 20px", cursor: "pointer" as const, fontWeight: tab === t ? 600 : 400,
    borderBottom: tab === t ? "2px solid #E8384F" : "2px solid transparent",
    color: tab === t ? "#E8384F" : "#9CA3AF", fontSize: "13px", letterSpacing: "0.3px",
    textTransform: "uppercase" as const, transition: "all 0.15s",
  });

  const card = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    background: "#fff", borderRadius: "14px", padding: "20px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
    border: "1px solid #F3F4F6", ...extra,
  });

  return (
    <div style={{ background: "#F8F9FA", minHeight: "100vh", color: "#1F2937",
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ background: "#fff", padding: "16px 28px", borderBottom: "1px solid #F3F4F6",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "38px", height: "38px", borderRadius: "10px",
            background: "linear-gradient(135deg, #E8384F, #D63384)", display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: "18px", color: "#fff", fontWeight: 800 }}>P</div>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 700, color: "#111827" }}>Priya AI</div>
            <div style={{ fontSize: "11px", color: "#9CA3AF", fontWeight: 500 }}>
              {stats?.totalUsers} students · {stats?.activeToday} active today · {stats?.totalMessages?.toLocaleString()} messages
            </div>
          </div>
        </div>
        <button onClick={fetchDashboard} style={{ background: "#F9FAFB", border: "1px solid #E5E7EB",
          color: "#6B7280", padding: "8px 16px", borderRadius: "8px", cursor: "pointer",
          fontSize: "12px", fontWeight: 500 }}>
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0", padding: "0 28px", background: "#fff",
        borderBottom: "1px solid #F3F4F6", overflowX: "auto" }}>
        {tabs.map((t) => (
          <div key={t} onClick={() => setTab(t)} style={tabStyle(t)}>{t}</div>
        ))}
      </div>

      <div style={{ padding: "24px 28px", maxWidth: "1200px", margin: "0 auto" }}>

        {/* OVERVIEW */}
        {tab === "overview" && stats && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "14px", marginBottom: "24px" }}>
              {[
                { label: "Total Students", val: stats.totalUsers, sub: "all time", accent: "#E8384F" },
                { label: "Active Today", val: stats.activeToday, sub: "last 24h", accent: "#10B981" },
                { label: "Active This Week", val: stats.active7d, sub: "last 7d", accent: "#6366F1" },
                { label: "Power Users", val: stats.powerUsers, sub: "50+ msgs", accent: "#F59E0B" },
                { label: "Bounce Rate", val: stats.totalUsers > 0 ? Math.round((stats.bounced / stats.totalUsers) * 100) + "%" : "0%", sub: `${stats.bounced} left after 1 msg`, accent: "#EF4444" },
                { label: "Messages", val: stats.totalMessages.toLocaleString(), sub: `${stats.chats24h} today`, accent: "#3B82F6" },
                { label: "Voice Stored", val: stats.totalVoice, sub: "recordings", accent: "#8B5CF6" },
                { label: "Images Stored", val: stats.totalImages, sub: "photos", accent: "#EC4899" },
              ].map((s, i) => (
                <div key={i} style={card()}>
                  <div style={{ fontSize: "11px", color: "#9CA3AF", fontWeight: 500, textTransform: "uppercase",
                    letterSpacing: "0.5px", marginBottom: "8px" }}>{s.label}</div>
                  <div style={{ fontSize: "28px", fontWeight: 800, color: s.accent, lineHeight: 1 }}>{s.val}</div>
                  <div style={{ fontSize: "11px", color: "#D1D5DB", marginTop: "6px" }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Retention */}
            <div style={card({ marginBottom: "24px" })}>
              <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "16px", color: "#111827" }}>Retention Funnel</div>
              {[
                { label: "1 msg (bounced)", count: users.filter((u) => u.message_count === 1).length, color: "#EF4444" },
                { label: "2–5 messages", count: users.filter((u) => u.message_count >= 2 && u.message_count <= 5).length, color: "#F59E0B" },
                { label: "6–20 messages", count: users.filter((u) => u.message_count >= 6 && u.message_count <= 20).length, color: "#6366F1" },
                { label: "21–50 messages", count: users.filter((u) => u.message_count >= 21 && u.message_count <= 50).length, color: "#3B82F6" },
                { label: "50+ messages", count: users.filter((u) => u.message_count > 50).length, color: "#10B981" },
              ].map((b, i) => {
                const total = users.length || 1;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "10px" }}>
                    <div style={{ width: "120px", fontSize: "12px", color: "#6B7280", textAlign: "right", fontWeight: 500 }}>{b.label}</div>
                    <div style={{ flex: 1, background: "#F3F4F6", borderRadius: "6px", height: "28px", overflow: "hidden" }}>
                      <div style={{ width: `${(b.count / total) * 100}%`, minWidth: b.count > 0 ? "32px" : "0",
                        height: "100%", background: b.color, borderRadius: "6px",
                        display: "flex", alignItems: "center", paddingLeft: "10px", transition: "width 0.4s" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#fff" }}>{b.count}</span>
                      </div>
                    </div>
                    <div style={{ width: "40px", fontSize: "11px", color: "#9CA3AF", fontWeight: 500 }}>
                      {Math.round((b.count / total) * 100)}%
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Languages quick view */}
            <div style={card()}>
              <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "14px", color: "#111827" }}>Languages</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {langStats.map((l, i) => (
                  <div key={i} style={{ padding: "6px 14px", background: "#F9FAFB", borderRadius: "20px",
                    border: "1px solid #F3F4F6", fontSize: "12px", fontWeight: 500, color: "#374151" }}>
                    {langLabel[l.lang] || l.lang} <span style={{ color: "#E8384F", fontWeight: 700 }}>{l.cnt}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STUDENTS */}
        {tab === "students" && (
          <div>
            <input type="text" placeholder="Search students..."
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "100%", padding: "12px 18px", background: "#fff", boxSizing: "border-box",
                border: "1px solid #E5E7EB", borderRadius: "10px", color: "#1F2937", fontSize: "14px",
                marginBottom: "16px", outline: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
            />
            <div style={card({ padding: "0", overflow: "hidden" })}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #F3F4F6" }}>
                    {["Student", "Language", "Messages", "Today", "Last Active"].map((h) => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600,
                        color: "#6B7280", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id} onClick={() => { loadChats(u); setTab("chats"); }}
                      style={{ borderBottom: "1px solid #F9FAFB", cursor: "pointer", transition: "background 0.1s" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#FEFCE8"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ fontWeight: 600, color: "#111827" }}>{u.name || "(no name)"}</div>
                        {u.telegram_username && <div style={{ fontSize: "11px", color: "#9CA3AF" }}>@{u.telegram_username}</div>}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ padding: "3px 10px", background: "#F0F9FF", borderRadius: "12px",
                          fontSize: "11px", fontWeight: 500, color: "#0369A1" }}>
                          {langLabel[u.preferred_language || ""] || u.preferred_language || "—"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", fontWeight: 700,
                        color: u.message_count > 50 ? "#10B981" : u.message_count > 10 ? "#3B82F6" : "#9CA3AF" }}>
                        {u.message_count}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: "11px", color: "#6B7280" }}>
                        <span title="Text">{u.daily_text_count || 0}T</span>{" / "}
                        <span title="Voice">{u.daily_voice_count || 0}V</span>{" / "}
                        <span title="Image">{u.daily_image_count || 0}I</span>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: "12px", color: "#9CA3AF" }}>{timeAgo(u.last_message_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CHATS */}
        {tab === "chats" && (
          <div>
            {selectedUser ? (
              <div>
                <div style={{ ...card({ marginBottom: "16px" }), display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: "16px", color: "#111827" }}>{selectedUser.name || "(no name)"}</span>
                    {selectedUser.telegram_username && <span style={{ color: "#6366F1", marginLeft: "8px", fontSize: "13px" }}>@{selectedUser.telegram_username}</span>}
                    <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "3px" }}>
                      {langLabel[selectedUser.preferred_language || ""] || "—"} · {selectedUser.message_count} messages
                    </div>
                  </div>
                  <button onClick={() => { setSelectedUser(null); setTab("students"); }}
                    style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#6B7280",
                      padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: 500 }}>
                    ← Back to list
                  </button>
                </div>
                <div style={{ ...card({ padding: "16px" }), maxHeight: "65vh", overflowY: "auto" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {chats.map((c, i) => (
                      <div key={i} style={{
                        alignSelf: c.role === "user" ? "flex-start" : "flex-end",
                        maxWidth: "80%", padding: "10px 14px", borderRadius: "14px",
                        background: c.role === "user" ? "#F3F4F6" : "#EEF2FF",
                        fontSize: "13px", lineHeight: "1.6" }}>
                        <div style={{ fontSize: "10px", marginBottom: "4px", fontWeight: 600,
                          color: c.role === "user" ? "#9CA3AF" : "#6366F1" }}>
                          {c.role === "user" ? "Student" : "Priya"}
                          <span style={{ color: "#D1D5DB", marginLeft: "8px", fontWeight: 400 }}>
                            {new Date(c.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <div style={{ color: "#1F2937", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{c.content}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ ...card(), textAlign: "center", padding: "60px" }}>
                <div style={{ fontSize: "14px", color: "#9CA3AF" }}>Select a student from the Students tab to view conversations</div>
              </div>
            )}
          </div>
        )}

        {/* VOICE */}
        {tab === "voice" && (
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "16px", color: "#111827" }}>
              Voice Messages <span style={{ color: "#9CA3AF", fontWeight: 400 }}>({voiceMessages.length})</span>
            </div>
            {voiceMessages.length === 0 ? (
              <div style={{ ...card(), textAlign: "center", padding: "48px", color: "#9CA3AF" }}>
                No voice messages stored yet
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {voiceMessages.map((v) => (
                  <div key={v.id} style={card()}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontWeight: 600, fontSize: "13px", color: "#111827" }}>
                          {v.users?.name || v.users?.telegram_username || "Unknown"}
                        </span>
                        <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "12px", fontWeight: 600,
                          background: v.content_flag === "clean" ? "#F0FDF4" : "#FEF2F2",
                          color: v.content_flag === "clean" ? "#16A34A" : "#DC2626" }}>
                          {v.content_flag}
                        </span>
                      </div>
                      <div style={{ fontSize: "11px", color: "#9CA3AF" }}>
                        {timeAgo(v.created_at)}{v.file_size_bytes ? ` · ${(v.file_size_bytes / 1024).toFixed(1)}KB` : ""}
                      </div>
                    </div>
                    {v.ai_response && (
                      <div style={{ fontSize: "12px", color: "#6B7280", borderLeft: "3px solid #E5E7EB",
                        paddingLeft: "12px", lineHeight: 1.5 }}>
                        {v.ai_response.substring(0, 150)}{v.ai_response.length > 150 && "..."}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* LANGUAGES */}
        {tab === "languages" && (
          <div>
            <div style={card({ marginBottom: "20px" })}>
              <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "16px", color: "#111827" }}>Language Distribution</div>
              {langStats.map((l, i) => {
                const max = Math.max(...langStats.map((x) => Number(x.cnt)));
                const pct = max > 0 ? (Number(l.cnt) / max) * 100 : 0;
                const colors = ["#E8384F", "#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#EC4899", "#6366F1", "#14B8A6"];
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "10px" }}>
                    <div style={{ width: "100px", fontSize: "13px", textAlign: "right", fontWeight: 500, color: "#374151" }}>
                      {langLabel[l.lang] || l.lang}
                    </div>
                    <div style={{ flex: 1, background: "#F3F4F6", borderRadius: "6px", height: "30px", overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: colors[i % colors.length],
                        borderRadius: "6px", display: "flex", alignItems: "center", paddingLeft: "12px",
                        minWidth: "36px", transition: "width 0.4s" }}>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "#fff" }}>{l.cnt}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={card()}>
              <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "14px", color: "#111827" }}>Daily Limits Per Student</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
                {[
                  { type: "Text", limit: LIMITS.text, color: "#3B82F6", cost: "₹0.13/msg" },
                  { type: "Voice", limit: LIMITS.voice, color: "#8B5CF6", cost: "₹2.68/msg" },
                  { type: "Image", limit: LIMITS.image, color: "#EC4899", cost: "₹0.21/msg" },
                ].map((l, i) => (
                  <div key={i} style={{ textAlign: "center", padding: "20px 16px", background: "#F9FAFB",
                    borderRadius: "12px", border: "1px solid #F3F4F6" }}>
                    <div style={{ fontSize: "32px", fontWeight: 800, color: l.color }}>{l.limit}</div>
                    <div style={{ fontSize: "11px", color: "#6B7280", fontWeight: 500, marginTop: "4px" }}>
                      {l.type} per day
                    </div>
                    <div style={{ fontSize: "10px", color: "#D1D5DB", marginTop: "2px" }}>{l.cost}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
