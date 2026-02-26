// Intentionally vulnerable JS/TS code for scanner validation.
// DO NOT deploy — every line is a deliberate security flaw.

import express from "express";
const app = express();

// 1. SQL injection via template literal
app.get("/users", async (req, res) => {
  const result = await db.query(`SELECT * FROM users WHERE id = ${req.params.id}`);
  res.json(result);
});

// 2. Prototype pollution via Object.assign
app.post("/config", (req, res) => {
  const merged = Object.assign({}, req.body);
  res.json(merged);
});

// 3. Insecure random for token generation
function generateToken() {
  return Math.random().toString(36).substring(2);
}

// 4. XXE — XML parsing without entity restriction
import { parseXml } from "libxmljs";
function parse(input: string) {
  return parseXml(input);
}

// 5. LDAP injection via string concatenation
function findUser(username: string) {
  return ldap.search(`(uid=${username})`);
}

// 6. Timing-unsafe secret comparison
function verifyToken(token: string, expected: string) {
  if (token === expected) return true;
  return false;
}

// 7. Mass assignment — spreading req.body into ORM create
app.post("/users", async (req, res) => {
  const user = await prisma.user.create({ ...req.body });
  res.json(user);
});

// 8. Header injection — user input in response header
app.get("/download", (req, res) => {
  res.setHeader("Content-Disposition", req.query.filename);
  res.send("ok");
});

// 9. Log injection — user input in logger
app.post("/login", (req, res) => {
  logger.info("Login attempt from: " + req.body.username);
  res.send("ok");
});

// 10. Unsafe RegExp from user input
app.get("/search", (req, res) => {
  const pattern = new RegExp(req.query.pattern);
  res.json(data.filter((d) => pattern.test(d.name)));
});

// 11. Unvalidated URL from user input
app.get("/fetch", (req, res) => {
  const url = new URL(req.query.redirect);
  res.redirect(url.toString());
});

// 12. Route handler without auth middleware
app.get("/admin/secrets", async (req, res) => {
  res.json(await getSecrets());
});

// 13. Insecure cookie — no secure/httpOnly flags
app.post("/session", (req, res) => {
  res.cookie("session", createSession(req.body));
  res.send("ok");
});

// 14. Template injection — user input as template
import Handlebars from "handlebars";
app.post("/render", (req, res) => {
  const tpl = Handlebars.compile(req.body.template);
  res.send(tpl({}));
});

// 15. CORS credentials with wildcard origin
import cors from "cors";
app.use(cors({ credentials: true, origin: '*' }));
