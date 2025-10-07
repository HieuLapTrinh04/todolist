import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE = "http://localhost:5000/api"; // thay nếu backend khác
const TASKS_ENDPOINT = `${API_BASE}/tasks`;

// helper: get auth headers if token exists
function authHeaders() {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const FILTERS = {
  all: { label: "All", fn: () => true },
  active: { label: "Active", fn: (t) => !t.completed },
  completed: { label: "Completed", fn: (t) => t.completed },
};

export default function App() {
  const [tasks, setTasks] = useState(() => {
    try {
      const s = localStorage.getItem("todo_tasks_v1");
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState("all");
  const [dark, setDark] = useState(() => {
    // priority: saved choice > system preference (prefers-color-scheme)
    const saved = localStorage.getItem("todo_theme_v1");
    if (saved) return saved === "dark";
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // apply theme class and persist
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("todo_theme_v1", dark ? "dark" : "light");
  }, [dark]);

  // persist tasks to localStorage
  useEffect(() => {
    localStorage.setItem("todo_tasks_v1", JSON.stringify(tasks));
  }, [tasks]);

  // fetch tasks from server on mount - fallback to localStorage data if network fails
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetch(TASKS_ENDPOINT, { headers: { "Content-Type": "application/json", ...authHeaders() } })
      .then((r) => {
        if (!r.ok) throw new Error(`Status ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!mounted) return;
        // server data expected array of tasks, transform if necessary
        // tasks might have _id field (Mongo) or id (other). Normalize to id.
        const normalized = data.map((t) => ({
          id: t._id || t.id || Date.now() + Math.random(),
          text: t.text || t.title || "",
          completed: !!t.completed,
          createdAt: t.createdAt || Date.now(),
        }));
        setTasks(normalized);
        setError(null);
      })
      .catch((err) => {
        // network error or backend no auth -> keep local tasks
        console.warn("Fetch tasks failed:", err);
        setError("Không thể kết nối server — đang dùng dữ liệu local");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, []);

  // helper to call backend (post/put/delete). If request fails, update local state only.
  async function callApi(path, opts = {}) {
    const headers = { "Content-Type": "application/json", ...authHeaders(), ...(opts.headers || {}) };
    try {
      const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
      if (!res.ok) {
        // return body text for debugging
        const text = await res.text();
        throw new Error(`API ${res.status}: ${text}`);
      }
      // try parse json, some endpoints may return empty body
      try {
        return await res.json();
      } catch {
        return null;
      }
    } catch (err) {
      console.warn("API call failed:", err);
      // bubble error up
      throw err;
    }
  }

  // Add
  const addTask = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    // optimistic id
    const optimistic = {
      id: `local-${Date.now()}`,
      text: trimmed,
      completed: false,
      createdAt: Date.now(),
    };
    setTasks((prev) => [optimistic, ...prev]);
    setInput("");
    // try post to server
    try {
      const payload = { text: trimmed };
      const serverRes = await callApi("/tasks", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (serverRes) {
        // serverRes may be inserted doc or {insertedId...}
        // if server returns _id or id, replace optimistic
        const serverId = serverRes._id || (serverRes.insertedId ? serverRes.insertedId : null);
        setTasks((prev) =>
          prev.map((t) =>
            t.id === optimistic.id ? { ...t, id: serverId || t.id } : t
          )
        );
      }
    } catch (err) {
      // keep optimistic local, show error
      setError("Không lưu được lên server — lưu tạm local.");
    }
  };

  // Toggle complete
  const toggleComplete = async (id) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
    // try update backend
    try {
      await callApi(`/tasks/${id}`, {
        method: "PUT",
        body: JSON.stringify({ completed: !tasks.find((t) => t.id === id)?.completed }),
      });
    } catch (err) {
      setError("Không cập nhật trạng thái trên server.");
    }
  };

  // Delete
  const deleteTask = async (id) => {
    // optimistic remove
    const before = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await callApi(`/tasks/${id}`, { method: "DELETE" });
    } catch (err) {
      setError("Không xóa được trên server.");
      // rollback
      setTasks(before);
    }
  };

  // Edit (inline)
  const saveEdit = async (id, newText) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, text: newText } : t)));
    try {
      await callApi(`/tasks/${id}`, {
        method: "PUT",
        body: JSON.stringify({ text: newText }),
      });
    } catch {
      setError("Không cập nhật được trên server.");
    }
  };

  const clearCompleted = async () => {
    const remaining = tasks.filter((t) => !t.completed);
    setTasks(remaining);
    // if backend supports bulk delete, implement here; else delete one-by-one
    try {
      const completed = tasks.filter((t) => t.completed);
      await Promise.all(completed.map((c) => callApi(`/tasks/${c.id}`, { method: "DELETE" })));
    } catch {
      setError("Không xóa hoàn thành trên server.");
    }
  };

  // filtered tasks
  const filtered = tasks.filter(FILTERS[filter].fn);

  // keyboard enter handler
  const handleKeyDown = (e) => {
    if (e.key === "Enter") addTask();
  };

  // small UI helpers
  const itemsLeft = tasks.filter((t) => !t.completed).length;

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <div className="w-full max-w-2xl p-6 neu">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Neumorphism Todo</h1>

          <div className="flex items-center gap-3">
            <div className="text-sm" style={{ color: "var(--muted)" }}>{loading ? "Loading..." : `${itemsLeft} left`}</div>
            <button
              onClick={() => setDark(!dark)}
              className="neu-btn px-3 py-2"
            >
              {dark ? "🌙" : "☀️"}
            </button>
          </div>
        </div>

        {/* input */}
        <div className="mb-4 flex gap-3">
          <div className="flex-1 neu-inset p-3 flex items-center gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="neu-input text-base w-full bg-transparent outline-none"
              placeholder="What needs to be done?"
            />
          </div>
          <button onClick={addTask} className="neu-btn px-4 py-2">Add</button>
        </div>

        {/* filter */}
        <div className="flex items-center gap-2 mb-4">
          {Object.keys(FILTERS).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1 rounded-lg ${filter === k ? "bg-accent text-white" : "neu-btn"}`}
            >
              {FILTERS[k].label}
            </button>
          ))}
          <div className="ml-auto text-sm" style={{ color: "var(--muted)" }}>
            {tasks.length} total
          </div>
        </div>

        {/* list */}
        <ul className="space-y-3">
          <AnimatePresence>
            {filtered.map((task) => (
              <motion.li
                key={task.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`flex items-center justify-between p-3 rounded-lg`}
                style={{ background: "var(--surface)", boxShadow: "var(--shadow1), var(--shadow2)" }}
              >
                <div className="flex items-center gap-3 flex-1">
                  <button
                    onClick={() => toggleComplete(task.id)}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${task.completed ? "bg-green-100 text-green-600" : "bg-transparent"}`}
                    aria-label="toggle"
                    title={task.completed ? "Completed" : "Mark complete"}
                  >
                    {task.completed ? "✓" : "○"}
                  </button>

                  <TaskText
                    task={task}
                    onSave={(newText) => saveEdit(task.id, newText)}
                  />
                </div>

                <div className="flex items-center gap-2 ml-3">
                  <button onClick={() => deleteTask(task.id)} className="px-3 py-1 neu-btn text-sm text-red-500">Delete</button>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        <div className="flex items-center justify-between mt-6">
          <div style={{ color: "var(--muted)" }}>{tasks.length} total</div>
          <div className="flex items-center gap-3">
            <button onClick={clearCompleted} className="neu-btn px-3 py-2 text-sm text-red-500">Clear completed</button>
            <button onClick={() => { if (window.confirm("Reset all tasks?")) setTasks([]); }} className="neu-btn px-3 py-2 text-sm">Reset</button>
          </div>
        </div>

        {error && <div className="mt-3 text-sm text-red-500">{error}</div>}
      </div>
    </div>
  );
}

// component for inline editing
function TaskText({ task, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(task.text);

  useEffect(() => setVal(task.text), [task.text]);

  const save = () => {
    const trimmed = val.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setEditing(false);
  };

  return (
    <>
      {!editing ? (
        <div className={`flex-1 select-none ${task.completed ? "line-through text-muted" : ""}`} style={{ color: "var(--text)" }}>
          <div onDoubleClick={() => setEditing(true)}>{task.text}</div>
        </div>
      ) : (
        <div className="flex-1">
          <input
            className="w-full bg-transparent border-none outline-none"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </div>
      )}
    </>
  );
}
