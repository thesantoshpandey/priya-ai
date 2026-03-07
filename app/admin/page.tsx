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

const langEmoji: Record<string, string> = {
  hinglish: "🇮🇳", hindi: "🇮🇳", tamil: "🇹🇳", kannada: "🏛️", telugu: "🌾",
  malayalam: "🌴", bengali: "🐅", marathi: "⛰️", gujarati: "💎", punjabi: "💪",
  english: "🇬🇧", odia: "🛕", urdu: "📿", assamese: "🍵",
};

function timeAgo(d: string | null) {
  if (!d) return "never";
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

  // Login screen
  if (!authenticated) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: "#0D1117", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", maxWidth: "360px", width: "100%", padding: "0 20px" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🧠</div>
          <h1 style={{ color: "#FF6B35", fontSize: "24px", marginBottom: "8px" }}>Priya AI Admin</h1>
          <p style={{ color: "#8B949E", marginBottom: "24px", fontSize: "14px" }}>Enter admin password</p>
          <input type="password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchDashboard()}
            placeholder="Password"
            style={{ width: "100%", padding: "12px 16px", background: "#161B22",
              border: "1px solid #30363D", borderRadius: "8px", color: "#C9D1D9",
              fontSize: "16px", marginBottom: "12px", outline: "none", boxSizing: "border-box" }}
          />
          <button onClick={fetchDashboard} disabled={loading}
            style={{ width: "100%", padding: "12px", background: "#FF6B35", color: "#fff",
              border: "none", borderRadius: "8px", fontSize: "16px", fontWeight: 600,
              cursor: "pointer", opacity: loading ? 0.6 : 1 }}>
            {loading ? "Loading..." : "Login"}
          </button>
          {error && <p style={{ color: "#F85149", marginTop: "12px", fontSize: "14px" }}>{error}</p>}
        </div>
      </div>
    );
  }

  const tabStyle = (t: string) => ({
    padding: "10px 16px", cursor: "pointer" as const, fontWeight: tab === t ? 700 : 400,
    borderBottom: tab === t ? "3px solid #FF6B35" : "3px solid transparent",
    color: tab === t ? "#FF6B35" : "#8B8B8B", fontSize: "13px", letterSpacing: "0.5px",
    textTransform: "uppercase" as const,
  });

  return (
    <div style={{ background: "#0D1117", minHeight: "100vh", color: "#C9D1D9",
      fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1A1A2E 0%, #16213E 50%, #0F3460 100%)",
        padding: "16px 20px", borderBottom: "1px solid #21262D", display: "flex",
        justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "#FF6B35" }}>
            🧠 Priya AI <span style={{ color: "#58A6FF", fontSize: "13px", fontWeight: 400 }}>Control Center</span>
          </div>
          <div style={{ fontSize: "11px", color: "#8B949E", marginTop: "2px" }}>
            {stats?.totalUsers} students • {stats?.activeToday} active today • {stats?.totalMessages} messages
          </div>
        </div>
        <button onClick={fetchDashboard} style={{ background: "#21262D", border: "1px solid #30363D",
          color: "#58A6FF", padding: "6px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}>
          ↻ Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "2px", padding: "0 20px", background: "#161B22",
        borderBottom: "1px solid #21262D", overflowX: "auto" }}>
        {["overview", "students", "chats", "voice", "languages"].map((t) => (
          <div key={t} onClick={() => setTab(t)} style={tabStyle(t)}>{t}</div>
        ))}
      </div>

      <div style={{ padding: "20px" }}>

        {/* OVERVIEW */}
        {tab === "overview" && stats && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "20px" }}>
              {[
                { label: "Total Students", val: stats.totalUsers, icon: "👩‍🎓", color: "#58A6FF" },
                { label: "Active 24h", val: stats.activeToday, icon: "🟢", color: "#3FB950" },
                { label: "Active 7d", val: stats.active7d, icon: "📅", color: "#D2A8FF" },
                { label: "Power Users", val: stats.powerUsers, icon: "⚡", color: "#FF6B35" },
                { label: "Bounced", val: stats.bounced, icon: "🚪", color: "#F85149" },
                { label: "Messages", val: stats.totalMessages, icon: "💬", color: "#79C0FF" },
                { label: "Voice Stored", val: stats.totalVoice, icon: "🎤", color: "#FFA657" },
                { label: "Images Stored", val: stats.totalImages, icon: "📸", color: "#D2A8FF" },
                { label: "Msgs Today", val: stats.chats24h, icon: "📊", color: "#3FB950" },
              ].map((s, i) => (
                <div key={i} style={{ background: "#161B22", border: "1px solid #21262D",
                  borderRadius: "10px", padding: "14px" }}>
                  <div style={{ fontSize: "11px", color: "#8B949E", marginBottom: "6px" }}>{s.icon} {s.label}</div>
                  <div style={{ fontSize: "24px", fontWeight: 800, color: s.color }}>{s.val}</div>
                </div>
              ))}
            </div>

            {/* Retention */}
            <div style={{ background: "#161B22", border: "1px solid #21262D", borderRadius: "10px", padding: "16px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "12px", color: "#FF6B35" }}>🔄 Retention Funnel</div>
              {[
                { label: "1 msg (bounced)", count: users.filter((u) => u.message_count === 1).length, color: "#F85149" },
                { label: "2-5 msgs", count: users.filter((u) => u.message_count >= 2 && u.message_count <= 5).length, color: "#FFA657" },
                { label: "6-20 msgs", count: users.filter((u) => u.message_count >= 6 && u.message_count <= 20).length, color: "#D2A8FF" },
                { label: "21-50 msgs", count: users.filter((u) => u.message_count >= 21 && u.message_count <= 50).length, color: "#58A6FF" },
                { label: "50+ msgs ⚡", count: users.filter((u) => u.message_count > 50).length, color: "#3FB950" },
              ].map((b, i) => {
                const max = Math.max(...[users.filter((u) => u.message_count === 1).length, users.filter((u) => u.message_count >= 2 && u.message_count <= 5).length, users.filter((u) => u.message_count >= 6 && u.message_count <= 20).length].concat([1]));
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                    <div style={{ width: "100px", fontSize: "11px", color: "#8B949E", textAlign: "right" }}>{b.label}</div>
                    <div style={{ flex: 1, background: "#0D1117", borderRadius: "4px", height: "22px", overflow: "hidden" }}>
                      <div style={{ width: `${max > 0 ? (b.count / max) * 100 : 0}%`, height: "100%",
                        background: b.color, borderRadius: "4px", display: "flex", alignItems: "center", paddingLeft: "8px" }}>
                        <span style={{ fontSize: "10px", fontWeight: 700, color: "#0D1117" }}>{b.count}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* STUDENTS */}
        {tab === "students" && (
          <div>
            <input type="text" placeholder="Search by name, username, or language..."
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", background: "#0D1117", boxSizing: "border-box",
                border: "1px solid #30363D", borderRadius: "8px", color: "#C9D1D9", fontSize: "14px", marginBottom: "12px", outline: "none" }}
            />
            <div style={{ maxHeight: "75vh", overflowY: "auto" }}>
              {filteredUsers.map((u) => (
                <div key={u.id} onClick={() => { loadChats(u); setTab("chats"); }}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 14px", background: "#161B22", border: "1px solid #21262D",
                    borderRadius: "8px", marginBottom: "6px", cursor: "pointer", gap: "8px" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u.name || "(no name)"}{" "}
                      {u.telegram_username && <span style={{ color: "#58A6FF", fontWeight: 400 }}>@{u.telegram_username}</span>}
                    </div>
                    <div style={{ fontSize: "10px", color: "#8B949E", marginTop: "2px" }}>
                      {langEmoji[u.preferred_language || ""] || "🌐"} {u.preferred_language || "?"}
                    </div>
                  </div>
                  <div style={{ textAlign: "center", minWidth: "40px" }}>
                    <div style={{ fontSize: "16px", fontWeight: 700, color: u.message_count > 50 ? "#3FB950" : "#58A6FF" }}>{u.message_count}</div>
                    <div style={{ fontSize: "9px", color: "#484F58" }}>msgs</div>
                  </div>
                  <div style={{ fontSize: "10px", color: "#8B949E", whiteSpace: "nowrap" }}>{timeAgo(u.last_message_at)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CHATS */}
        {tab === "chats" && (
          <div>
            {selectedUser ? (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                  marginBottom: "12px", padding: "10px 14px", background: "#161B22", borderRadius: "8px", border: "1px solid #21262D" }}>
                  <div>
                    <span style={{ fontWeight: 700, color: "#FF6B35" }}>{selectedUser.name || "(no name)"}</span>
                    {selectedUser.telegram_username && <span style={{ color: "#58A6FF", marginLeft: "8px", fontSize: "13px" }}>@{selectedUser.telegram_username}</span>}
                    <div style={{ fontSize: "10px", color: "#8B949E", marginTop: "2px" }}>
                      {langEmoji[selectedUser.preferred_language || ""] || "🌐"} {selectedUser.preferred_language} • {selectedUser.message_count} msgs
                    </div>
                  </div>
                  <button onClick={() => { setSelectedUser(null); setTab("students"); }}
                    style={{ background: "#21262D", border: "1px solid #30363D", color: "#8B949E",
                      padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}>← Back</button>
                </div>
                <div style={{ maxHeight: "70vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
                  {chats.map((c, i) => (
                    <div key={i} style={{
                      alignSelf: c.role === "user" ? "flex-start" : "flex-end",
                      maxWidth: "85%", padding: "8px 12px", borderRadius: "10px",
                      background: c.role === "user" ? "#1F2937" : "#0F3460",
                      border: `1px solid ${c.role === "user" ? "#374151" : "#1A4A7A"}`, fontSize: "13px", lineHeight: "1.5" }}>
                      <div style={{ color: c.role === "user" ? "#9CA3AF" : "#60A5FA", fontSize: "9px", marginBottom: "3px", fontWeight: 600 }}>
                        {c.role === "user" ? "👤 Student" : "🧠 Priya"}
                        <span style={{ color: "#484F58", marginLeft: "6px" }}>{new Date(c.created_at).toLocaleTimeString()}</span>
                      </div>
                      <div style={{ color: "#E5E7EB", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{c.content}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "40px", color: "#484F58" }}>
                <div style={{ fontSize: "40px", marginBottom: "12px" }}>💬</div>
                Select a student from the Students tab
              </div>
            )}
          </div>
        )}

        {/* VOICE */}
        {tab === "voice" && (
          <div>
            <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "12px", color: "#FF6B35" }}>🎤 Voice Messages ({voiceMessages.length})</div>
            {voiceMessages.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#484F58" }}>No voice messages stored yet</div>
            ) : voiceMessages.map((v) => (
              <div key={v.id} style={{ background: "#161B22", border: "1px solid #21262D", borderRadius: "8px", padding: "10px 14px", marginBottom: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: "13px" }}>{v.users?.name || v.users?.telegram_username || "Unknown"}</span>
                    <span style={{ marginLeft: "8px", fontSize: "10px", padding: "2px 6px", borderRadius: "10px",
                      background: v.content_flag === "clean" ? "#0D2818" : "#3D1117",
                      color: v.content_flag === "clean" ? "#3FB950" : "#F85149" }}>{v.content_flag}</span>
                  </div>
                  <div style={{ fontSize: "10px", color: "#8B949E" }}>
                    {timeAgo(v.created_at)} {v.file_size_bytes && `• ${(v.file_size_bytes/1024).toFixed(1)}KB`}
                  </div>
                </div>
                {v.ai_response && (
                  <div style={{ fontSize: "11px", color: "#8B949E", borderLeft: "2px solid #30363D", paddingLeft: "8px" }}>
                    <span style={{ color: "#58A6FF" }}>Priya:</span> {v.ai_response.substring(0, 120)}{v.ai_response.length > 120 && "..."}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* LANGUAGES */}
        {tab === "languages" && (
          <div>
            <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "12px", color: "#FF6B35" }}>🌐 Language Distribution</div>
            {langStats.map((l, i) => {
              const max = Math.max(...langStats.map((x) => Number(x.cnt)));
              const pct = max > 0 ? (Number(l.cnt) / max) * 100 : 0;
              const colors = ["#FF6B35", "#58A6FF", "#3FB950", "#D2A8FF", "#FFA657", "#F85149", "#79C0FF"];
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                  <div style={{ width: "110px", fontSize: "13px", textAlign: "right" }}>
                    {langEmoji[l.lang] || "🌐"} {l.lang}
                  </div>
                  <div style={{ flex: 1, background: "#0D1117", borderRadius: "6px", height: "28px", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: colors[i % colors.length],
                      borderRadius: "6px", display: "flex", alignItems: "center", paddingLeft: "10px", minWidth: "36px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#0D1117" }}>{l.cnt}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            <div style={{ background: "#161B22", border: "1px solid #21262D", borderRadius: "10px", padding: "16px", marginTop: "20px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "10px", color: "#FF6B35" }}>⚡ Daily Limits Per Student</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                {[
                  { type: "Text", limit: LIMITS.text, icon: "📝", color: "#58A6FF", cost: "₹0.13" },
                  { type: "Voice", limit: LIMITS.voice, icon: "🎤", color: "#FFA657", cost: "₹2.68" },
                  { type: "Image", limit: LIMITS.image, icon: "📸", color: "#D2A8FF", cost: "₹0.21" },
                ].map((l, i) => (
                  <div key={i} style={{ textAlign: "center", padding: "12px", background: "#0D1117", borderRadius: "8px" }}>
                    <div style={{ fontSize: "28px" }}>{l.icon}</div>
                    <div style={{ fontSize: "20px", fontWeight: 800, color: l.color, margin: "6px 0" }}>{l.limit}/day</div>
                    <div style={{ fontSize: "11px", color: "#8B949E" }}>{l.type}</div>
                    <div style={{ fontSize: "10px", color: "#484F58" }}>{l.cost}/msg</div>
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
