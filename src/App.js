import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE = "http://localhost:5000/api"; // thay nếu backend khác
const TASKS_ENDPOINT = `${API_BASE}/tasks`;

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
    const saved = localStorage.getItem("todo_theme_v1");
    if (saved) return saved === "dark";
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("todo_theme_v1", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    localStorage.setItem("todo_tasks_v1", JSON.stringify(tasks));
  }, [tasks]);

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
        console.warn("Fetch tasks failed:", err);
        setError("Không thể kết nối server — đang dùng dữ liệu local");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, []);

  async function callApi(path, opts = {}) {
    const headers = { "Content-Type": "application/json", ...authHeaders(), ...(opts.headers || {}) };
    try {
      const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API ${res.status}: ${text}`);
      }
      try {
        return await res.json();
      } catch {
        return null;
      }
    } catch (err) {
      console.warn("API call failed:", err);
      throw err;
    }
  }

// helper: extract server id from possible shapes of response
function extractIdFromServerResp(res) {
  if (!res) return null;
  // if server returns directly the id string
  if (typeof res === "string") return res;
  // common fields
  if (res._id) {
    // sometimes _id is string
    if (typeof res._id === "string") return res._id;
    // sometimes _id is an object like { "$oid": "..." } or { "Hex": "..." }
    if (res._id.$oid) return res._id.$oid;
    if (res._id.Hex) return res._id.Hex;
  }
  if (res.insertedId) return res.insertedId;
  if (res.insertedID) return res.insertedID;
  if (res.inserted_id) return res.inserted_id;
  // fallback try to find any string-looking property
  for (const k of Object.keys(res)) {
    if (typeof res[k] === "string" && /^[a-fA-F0-9]{12,24}$/.test(res[k])) return res[k];
  }
  return null;
}

// check basic Mongo ObjectID hex format (24 hex chars)
function isValidObjectId(id) {
  return typeof id === "string" && /^[a-fA-F0-9]{24}$/.test(id);
}
  // Add
  const addTask = async () => {
  const trimmed = input.trim();
  if (!trimmed) return;
  const optimistic = {
    id: `local-${Date.now()}`,
    text: trimmed,
    completed: false,
    createdAt: Date.now(),
  };
  setTasks((prev) => [optimistic, ...prev]);
  setInput("");
  try {
    const payload = { text: trimmed };
    const serverRes = await callApi("/tasks", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    // extract id robustly
    const serverId = extractIdFromServerResp(serverRes);
    if (serverId) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === optimistic.id ? { ...t, id: serverId } : t
        )
      );
    } else {
      // server didn't return id string — keep optimistic id and warn
      console.warn("Server returned no usable id for POST:", serverRes);
    }
  } catch (err) {
    setError("Không lưu được lên server — lưu tạm local.");
    console.warn("POST failed:", err);
  }
};


const toggleComplete = async (id) => {
  // debug log
  if (!id) {
    console.warn("toggleComplete called with invalid id:", id);
    setError("Không xác định được task id (bỏ qua).");
    return;
  }

  // find task snapshot
  const currentTask = tasks.find((t) => t.id === id);
  if (!currentTask) {
    console.warn("toggleComplete: task not found in state for id:", id);
    return;
  }

  const updatedCompleted = !currentTask.completed;

  // optimistic update UI
  setTasks((prev) =>
    prev.map((t) => (t.id === id ? { ...t, completed: updatedCompleted } : t))
  );

  // If id is an optimistic local id (not sent to server yet), skip API call
  if (String(id).startsWith("local-") || !isValidObjectId(id)) {
    console.info("toggleComplete: skipping server update for local/invalid id:", id);
    // optionally queue sync logic here
    return;
  }

  try {
    await callApi(`/tasks/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ completed: updatedCompleted }),
    });
  } catch (err) {
    setError("Không cập nhật trạng thái trên server.");
    console.warn("API call failed in toggleComplete:", err);
    // optional: rollback UI change or mark sync-needed
  }
};

  // Delete
  const deleteTask = async (id) => {
    const before = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await callApi(`/tasks/${id}`, { method: "DELETE" });
    } catch (err) {
      setError("Không xóa được trên server.");
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
