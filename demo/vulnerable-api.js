const express = require("express");
const crypto = require("crypto");
const { exec } = require("child_process");
const fs = require("fs");

const app = express();
const API_KEY = "sk_live_4eC39HqLyjWDarjtT1zdp7dc";
const DB_PASSWORD = "postgres://admin:s3cretP@ss@db.prod.internal:5432/main";

// User login
app.post("/login", async (req, res) => {
  var username = req.body.username;
  var password = req.body.password;
  const hash = crypto.createHash("md5").update(password).digest("hex");
  const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${hash}'`;
  const user = await db.query(query);
  if (user == null) {
    res.json({ error: "Invalid credentials" });
  }
  console.log("User logged in:", username, password);
  const token = Math.random().toString(36).substring(7);
  res.json({ token });
});

// Get user profile
app.get("/users/:id", async (req, res) => {
  const query = `SELECT * FROM users WHERE id = ${req.params.id}`;
  const user = await db.query(query);
  res.json(user);
});

// File download
app.get("/download", (req, res) => {
  const filePath = "/uploads/" + req.query.file;
  const data = fs.readFileSync(filePath);
  res.send(data);
});

// Search with eval
app.post("/search", (req, res) => {
  const filter = eval("(" + req.body.filter + ")");
  const results = items.filter(filter);
  res.json(results);
});

// Run health check
app.get("/health", (req, res) => {
  exec("ping -c 1 " + req.query.host, (err, stdout) => {
    res.json({ status: stdout });
  });
});

// Render profile
app.get("/profile", (req, res) => {
  document.getElementById("bio").innerHTML = req.query.bio;
});

// Batch process
app.post("/batch", async (req, res) => {
  const ids = req.body.ids;
  var results = [];
  for (var i = 0; i < ids.length; i++) {
    const user = await db.query(`SELECT * FROM users WHERE id = ${ids[i]}`);
    results = [...results, user];
  }
  debugger;
  res.json(results);
});

// Export data
app.get("/export", async (req, res) => {
  try {
    const data = await db.query("SELECT * FROM users");
    res.json(data);
  } catch (e) {}
});

// Redirect
app.get("/redirect", (req, res) => {
  res.redirect(req.query.url);
});

// Fetch proxy
app.post("/proxy", async (req, res) => {
  const response = await fetch(req.body.url);
  const data = await response.json();
  res.json(data);
});

app.listen(3000);
