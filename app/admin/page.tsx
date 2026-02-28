"use client";

import { useState, useEffect } from "react";

interface User {
  id: string;
  name: string | null;
  telegram_username: string | null;
  telegram_chat_id: string;
  class: string | null;
  neet_year: string | null;
  is_minor: boolean;
  parental_consent: boolean;
  message_count: number;
  first_message_at: string;
  last_message_at: string;
  platform: string;
  tier: string;
}

interface Chat {
  id: string;
  role: string;
  content: string;
  created_at: string;
  tokens_used: number | null;
  response_time_ms: number | null;
}

interface Stats {
  totalUsers: number;
  activeToday: number;
  totalMessages: number;
  minors: number;
  consented: number;
}

export default function AdminDashboard() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${password}` },
      });
      if (!res.ok) throw new Error("Unauthorized");
      const data = await res.json();
      setUsers(data.users);
      setStats(data.stats);
      setAuthenticated(true);
      setError("");
    } catch {
      setError("Wrong password or server error");
      setAuthenticated(false);
    }
    setLoading(false);
  };

  const fetchChats = async (user: User) => {
    setSelectedUser(user);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/chats/${user.id}`, {
        headers: { Authorization: `Bearer ${password}` },
      });
      const data = await res.json();
      setChats(data.chats);
    } catch {
      setError("Failed to load chats");
    }
    setLoading(false);
  };

  // Login screen
  if (!authenticated) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginBox}>
          <h1 style={{ margin: "0 0 0.5rem 0" }}>🧬 Priya AI Admin</h1>
          <p style={{ color: "#666", margin: "0 0 1.5rem 0" }}>Enter admin password to continue</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchUsers()}
            placeholder="Admin password"
            style={styles.input}
          />
          <button onClick={fetchUsers} disabled={loading} style={styles.button}>
            {loading ? "Loading..." : "Login"}
          </button>
          {error && <p style={{ color: "#e74c3c", marginTop: "1rem" }}>{error}</p>}
        </div>
      </div>
    );
  }

  // Chat view
  if (selectedUser) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <button onClick={() => { setSelectedUser(null); setChats([]); }} style={styles.backButton}>
            ← Back to Users
          </button>
          <div>
            <h2 style={{ margin: 0 }}>
              {selectedUser.name || selectedUser.telegram_username || "Unknown"} 
              {selectedUser.is_minor && " 🔒 Minor"}
            </h2>
            <p style={{ margin: 0, color: "#666", fontSize: "0.85rem" }}>
              Class: {selectedUser.class || "?"} | Messages: {selectedUser.message_count} | 
              Platform: {selectedUser.platform} | 
              Consent: {selectedUser.parental_consent ? "✅" : selectedUser.is_minor ? "❌ Pending" : "N/A"}
            </p>
          </div>
        </div>
        <div style={styles.chatContainer}>
          {chats.map((chat) => (
            <div
              key={chat.id}
              style={{
                ...styles.chatBubble,
                ...(chat.role === "user" ? styles.userBubble : styles.aiBubble),
              }}
            >
              <div style={styles.chatRole}>
                {chat.role === "user" ? "👤 Student" : "🧬 Priya"}
                <span style={styles.chatTime}>
                  {new Date(chat.created_at).toLocaleString("en-IN", { 
                    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" 
                  })}
                  {chat.response_time_ms ? ` (${chat.response_time_ms}ms)` : ""}
                </span>
              </div>
              <div style={styles.chatText}>{chat.content}</div>
            </div>
          ))}
          {chats.length === 0 && !loading && (
            <p style={{ textAlign: "center", color: "#999" }}>No messages yet</p>
          )}
        </div>
      </div>
    );
  }

  // Users list
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={{ margin: 0 }}>🧬 Priya AI Admin</h1>
        <button onClick={fetchUsers} style={styles.refreshButton}>🔄 Refresh</button>
      </div>

      {/* Stats cards */}
      {stats && (
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={styles.statNumber}>{stats.totalUsers}</div>
            <div style={styles.statLabel}>Total Students</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statNumber}>{stats.activeToday}</div>
            <div style={styles.statLabel}>Active Today</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statNumber}>{stats.totalMessages}</div>
            <div style={styles.statLabel}>Total Messages</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statNumber, color: stats.minors > stats.consented ? "#e74c3c" : "#27ae60" }}>
              {stats.minors} / {stats.consented}
            </div>
            <div style={styles.statLabel}>Minors / Consented</div>
          </div>
        </div>
      )}

      {/* Users table */}
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Student</th>
              <th style={styles.th}>Class</th>
              <th style={styles.th}>Messages</th>
              <th style={styles.th}>Minor</th>
              <th style={styles.th}>Last Active</th>
              <th style={styles.th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} style={styles.tr}>
                <td style={styles.td}>
                  <strong>{user.name || "—"}</strong>
                  <br />
                  <span style={{ color: "#888", fontSize: "0.8rem" }}>
                    @{user.telegram_username || user.telegram_chat_id}
                  </span>
                </td>
                <td style={styles.td}>{user.class || "—"}</td>
                <td style={styles.td}>{user.message_count}</td>
                <td style={styles.td}>
                  {user.is_minor ? (user.parental_consent ? "✅" : "⚠️") : "—"}
                </td>
                <td style={styles.td}>
                  {new Date(user.last_message_at).toLocaleString("en-IN", {
                    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                  })}
                </td>
                <td style={styles.td}>
                  <button onClick={() => fetchChats(user)} style={styles.viewButton}>
                    View Chats
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <p style={{ textAlign: "center", padding: "2rem", color: "#999" }}>
            No students yet. Share the Telegram bot link to get started!
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================
// STYLES
// ============================================

const styles: Record<string, React.CSSProperties> = {
  loginContainer: {
    display: "flex", alignItems: "center", justifyContent: "center",
    minHeight: "100vh", background: "#f5f5f5",
  },
  loginBox: {
    background: "white", padding: "2.5rem", borderRadius: "16px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)", textAlign: "center", width: "360px",
  },
  input: {
    width: "100%", padding: "0.75rem 1rem", border: "1px solid #ddd",
    borderRadius: "8px", fontSize: "1rem", boxSizing: "border-box",
  },
  button: {
    width: "100%", padding: "0.75rem", background: "#764ba2", color: "white",
    border: "none", borderRadius: "8px", fontSize: "1rem", cursor: "pointer",
    marginTop: "1rem", fontWeight: "bold",
  },
  container: {
    maxWidth: "1200px", margin: "0 auto", padding: "1.5rem",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: "1.5rem", flexWrap: "wrap" as const, gap: "1rem",
  },
  refreshButton: {
    padding: "0.5rem 1rem", background: "#f0f0f0", border: "1px solid #ddd",
    borderRadius: "8px", cursor: "pointer", fontSize: "0.9rem",
  },
  backButton: {
    padding: "0.5rem 1rem", background: "#764ba2", color: "white",
    border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "0.9rem",
  },
  statsGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "1rem", marginBottom: "2rem",
  },
  statCard: {
    background: "white", padding: "1.5rem", borderRadius: "12px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)", textAlign: "center",
  },
  statNumber: { fontSize: "2rem", fontWeight: "bold", color: "#764ba2" },
  statLabel: { fontSize: "0.85rem", color: "#888", marginTop: "0.25rem" },
  tableContainer: {
    background: "white", borderRadius: "12px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)", overflow: "auto",
  },
  table: { width: "100%", borderCollapse: "collapse" as const },
  th: {
    textAlign: "left" as const, padding: "1rem", borderBottom: "2px solid #eee",
    color: "#555", fontSize: "0.85rem", textTransform: "uppercase" as const,
  },
  tr: { borderBottom: "1px solid #f5f5f5" },
  td: { padding: "0.75rem 1rem", fontSize: "0.9rem" },
  viewButton: {
    padding: "0.4rem 0.8rem", background: "#764ba2", color: "white",
    border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.8rem",
  },
  chatContainer: {
    display: "flex", flexDirection: "column" as const, gap: "0.75rem",
    maxHeight: "70vh", overflowY: "auto" as const, padding: "1rem",
    background: "#f9f9f9", borderRadius: "12px",
  },
  chatBubble: {
    padding: "0.75rem 1rem", borderRadius: "12px", maxWidth: "80%",
  },
  userBubble: {
    background: "#e8f4fd", alignSelf: "flex-start" as const, borderTopLeftRadius: "4px",
  },
  aiBubble: {
    background: "#f0e8fd", alignSelf: "flex-end" as const, borderTopRightRadius: "4px",
  },
  chatRole: {
    fontSize: "0.75rem", color: "#888", marginBottom: "0.25rem",
    display: "flex", justifyContent: "space-between",
  },
  chatTime: { fontSize: "0.7rem", color: "#aaa" },
  chatText: { fontSize: "0.9rem", lineHeight: "1.5" },
};
