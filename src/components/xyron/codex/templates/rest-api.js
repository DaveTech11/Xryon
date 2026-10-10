// Simple REST API with Express. In-memory data, so it resets when the server restarts.
// Run:  npm install  then  npm start     (see package.json)
import express from "express";

const app = express();
app.use(express.json({ limit: "100kb" }));

let nextId = 1;
const todos = [];

app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/api/todos", (req, res) => res.json(todos));

app.post("/api/todos", (req, res) => {
  const title = String(req.body?.title || "").trim();
  if (!title) return res.status(400).json({ error: "title is required" });
  const todo = { id: nextId++, title, done: false };
  todos.push(todo);
  res.status(201).json(todo);
});

app.patch("/api/todos/:id", (req, res) => {
  const todo = todos.find((t) => t.id === Number(req.params.id));
  if (!todo) return res.status(404).json({ error: "not found" });
  if (typeof req.body?.done === "boolean") todo.done = req.body.done;
  if (typeof req.body?.title === "string" && req.body.title.trim()) todo.title = req.body.title.trim();
  res.json(todo);
});

app.delete("/api/todos/:id", (req, res) => {
  const index = todos.findIndex((t) => t.id === Number(req.params.id));
  if (index === -1) return res.status(404).json({ error: "not found" });
  todos.splice(index, 1);
  res.status(204).end();
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
