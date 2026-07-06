const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Database = require("better-sqlite3");

let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch {
  nodemailer = null;
}

const app = express();
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER;

const mailEnabled = Boolean(nodemailer && SMTP_HOST && MAIL_FROM);
const mailTransport = mailEnabled
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
    })
  : null;

const dataDir = path.join(__dirname, "data");
const storageDir = path.join(__dirname, "storage");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(storageDir, { recursive: true });

const db = new Database(path.join(dataDir, "app.sqlite"));

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT,
    size INTEGER,
    path TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    email_verified INTEGER NOT NULL DEFAULT 0,
    verify_token TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_members (
    user_id INTEGER NOT NULL,
    project_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, project_id)
  );
`);

// Defensive Migration: neue Spalten nur ergänzen, wenn sie fehlen.
const fileColumns = db.prepare("PRAGMA table_info(files)").all().map((c) => c.name);

const newColumns = [
  ["area", "TEXT DEFAULT 'uploads'"],
  ["category", "TEXT"],
  ["status", "TEXT DEFAULT 'new'"],
  ["uploaded_by", "TEXT"]
];

for (const [name, definition] of newColumns) {
  if (!fileColumns.includes(name)) {
    db.exec(`ALTER TABLE files ADD COLUMN ${name} ${definition}`);
  }
}

const projectColumns = db.prepare("PRAGMA table_info(projects)").all().map((c) => c.name);

if (!projectColumns.includes("image")) {
  db.exec("ALTER TABLE projects ADD COLUMN image TEXT");
}

const userColumns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);

for (const [name, definition] of [["reset_token", "TEXT"], ["reset_expires", "TEXT"]]) {
  if (!userColumns.includes(name)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
  }
}

function categorizeFile(originalName, mimeType) {
  const name = (originalName || "").toLowerCase();
  const mime = mimeType || "";
  const ext = path.extname(name);

  if ([".svg", ".eps", ".ai"].includes(ext)) return "logos";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "images";
  if ([".html", ".htm"].includes(ext)) return "html";
  if (/regie|ablauf|cue/.test(name)) return "regieplan";
  if ([".txt", ".doc", ".docx", ".pdf", ".xls", ".xlsx", ".csv", ".ppt", ".pptx", ".key", ".odp"].includes(ext)) return "text";
  return "other";
}

// Nur Video, Audio und Bilder dürfen in die Show.
const SHOW_CATEGORIES = ["video", "audio", "images"];

// Idempotenter Backfill: nur Zeilen ohne Kategorie, bestehende Werte bleiben unberührt.
const uncategorized = db
  .prepare("SELECT id, original_name, mime_type FROM files WHERE category IS NULL")
  .all();

if (uncategorized.length > 0) {
  const setCategory = db.prepare("UPDATE files SET category = ? WHERE id = ?");
  const backfill = db.transaction((rows) => {
    for (const row of rows) {
      setCategory.run(categorizeFile(row.original_name, row.mime_type), row.id);
    }
  });
  backfill(uncategorized);
}

const existingProject = db.prepare("SELECT * FROM projects LIMIT 1").get();

if (!existingProject) {
  db.prepare("INSERT INTO projects (title) VALUES (?)").run("Demo Projekt");
}

db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();

/* ---------- Auth-Helfer ---------- */

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return salt + ":" + hash;
}

function verifyPassword(password, stored) {
  const [salt, hash] = (stored || "").split(":");
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
}

function getSessionUser(req) {
  const cookies = req.headers.cookie || "";
  const pair = cookies
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("mh_session="));

  if (!pair) return null;

  const token = pair.slice("mh_session=".length);

  return db
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    )
    .get(token);
}

function createSession(res, req, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))").run(
    token,
    userId
  );

  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.setHeader(
    "Set-Cookie",
    `mh_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}${secure ? "; Secure" : ""}`
  );
}

function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Nicht angemeldet" });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Nur für Admins" });
  next();
}

function canAccessProject(user, projectId) {
  if (user.role === "admin") return true;
  return Boolean(
    db.prepare("SELECT 1 FROM project_members WHERE user_id = ? AND project_id = ?").get(user.id, projectId)
  );
}

function requireProjectAccess(req, res, next) {
  if (!canAccessProject(req.user, Number(req.params.projectId))) {
    return res.status(403).json({ error: "Kein Zugriff auf dieses Projekt" });
  }
  next();
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    email_verified: Boolean(user.email_verified),
    created_at: user.created_at
  };
}

async function sendVerificationMail(user) {
  const link = `${APP_URL}/api/auth/verify?token=${user.verify_token}`;

  if (!mailEnabled) {
    console.log(`[mail deaktiviert] Bestätigungslink für ${user.email}: ${link}`);
    return false;
  }

  await mailTransport.sendMail({
    from: MAIL_FROM,
    to: user.email,
    subject: "Media Hub: E-Mail bestätigen",
    text: `Hallo ${user.name},\n\nbitte bestätige deine E-Mail-Adresse für den Media Hub:\n\n${link}\n\nDanach kann dich ein Admin für Projekte freigeben.`
  });

  return true;
}

/* ---------- Middleware / Statisches ---------- */

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  "/storage",
  requireAuth,
  express.static(storageDir, {
    setHeaders: (res, filePath) => {
      // .ai-Dateien sind meist PDF-kompatibel; so kann der Browser sie previewen.
      if (filePath.toLowerCase().endsWith(".ai")) {
        res.setHeader("Content-Type", "application/pdf");
      }
    }
  })
);

const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      const projectId = req.params.projectId;
      const dir = path.join(storageDir, "projects", projectId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: function (req, file, cb) {
      const safeOriginal = file.originalname
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9._-]/g, "");

      const storedName = Date.now() + "_" + safeOriginal;
      cb(null, storedName);
    }
  })
});

const projectImageUpload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      const dir = path.join(storageDir, "project-images");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: function (req, file, cb) {
      const safeOriginal = file.originalname
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9._-]/g, "");

      cb(null, req.params.projectId + "_" + Date.now() + "_" + safeOriginal);
    }
  })
});

/* ---------- Auth-Routen ---------- */

app.post("/api/auth/register", async (req, res) => {
  const name = (req.body.name || "").trim();
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";

  if (!name || !email || !email.includes("@")) {
    return res.status(400).json({ error: "Bitte Name und gültige E-Mail angeben" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Passwort muss mindestens 8 Zeichen haben" });
  }
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
    return res.status(409).json({ error: "Diese E-Mail ist bereits registriert" });
  }

  const isFirstUser = !db.prepare("SELECT 1 FROM users LIMIT 1").get();
  const verifyToken = crypto.randomBytes(32).toString("hex");

  const result = db
    .prepare(
      `INSERT INTO users (name, email, password_hash, role, email_verified, verify_token)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(name, email, hashPassword(password), isFirstUser ? "admin" : "user", isFirstUser ? 1 : 0, verifyToken);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);

  let mailSent = false;
  if (!isFirstUser) {
    try {
      mailSent = await sendVerificationMail(user);
    } catch (err) {
      console.error("Mailversand fehlgeschlagen:", err.message);
    }
  }

  res.json({ ok: true, isFirstAdmin: isFirstUser, mailSent });
});

app.get("/api/auth/verify", (req, res) => {
  const token = req.query.token || "";
  const user = token ? db.prepare("SELECT * FROM users WHERE verify_token = ?").get(token) : null;

  if (!user) {
    return res.redirect("/?verifyerror=1");
  }

  db.prepare("UPDATE users SET email_verified = 1, verify_token = NULL WHERE id = ?").run(user.id);
  res.redirect("/?verified=1");
});

app.post("/api/auth/login", (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "E-Mail oder Passwort falsch" });
  }

  if (!user.email_verified) {
    return res.status(403).json({
      error: mailEnabled
        ? "E-Mail noch nicht bestätigt – bitte prüfe dein Postfach"
        : "Konto noch nicht bestätigt – ein Admin muss dich freischalten"
    });
  }

  createSession(res, req, user.id);
  res.json(publicUser(user));
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  const cookies = req.headers.cookie || "";
  const pair = cookies.split(";").map((s) => s.trim()).find((s) => s.startsWith("mh_session="));
  if (pair) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(pair.slice("mh_session=".length));
  }
  res.setHeader("Set-Cookie", "mh_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  res.json({ ok: true });
});

app.patch("/api/auth/me", requireAuth, (req, res) => {
  const name = (req.body.name || "").trim();

  if (!name) {
    return res.status(400).json({ error: "Name darf nicht leer sein" });
  }

  db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, req.user.id);
  res.json(publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id)));
});

app.post("/api/auth/forgot", async (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const user = email ? db.prepare("SELECT * FROM users WHERE email = ?").get(email) : null;

  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    db.prepare("UPDATE users SET reset_token = ?, reset_expires = datetime('now', '+2 hours') WHERE id = ?").run(
      token,
      user.id
    );

    const link = `${APP_URL}/?reset=${token}`;

    if (mailEnabled) {
      try {
        await mailTransport.sendMail({
          from: MAIL_FROM,
          to: user.email,
          subject: "Media Hub: Passwort zurücksetzen",
          text: `Hallo ${user.name},\n\nüber diesen Link kannst du ein neues Passwort setzen (2 Stunden gültig):\n\n${link}\n\nFalls du das nicht warst, ignoriere diese Mail.`
        });
      } catch (err) {
        console.error("Mailversand fehlgeschlagen:", err.message);
      }
    } else {
      console.log(`[mail deaktiviert] Reset-Link für ${user.email}: ${link}`);
    }
  }

  res.json({ ok: true, mailSent: mailEnabled });
});

app.post("/api/auth/reset", (req, res) => {
  const token = req.body.token || "";
  const password = req.body.password || "";

  if (password.length < 8) {
    return res.status(400).json({ error: "Passwort muss mindestens 8 Zeichen haben" });
  }

  const user = token
    ? db.prepare("SELECT * FROM users WHERE reset_token = ? AND reset_expires > datetime('now')").get(token)
    : null;

  if (!user) {
    return res.status(400).json({ error: "Link ungültig oder abgelaufen" });
  }

  db.prepare(
    "UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL, email_verified = 1 WHERE id = ?"
  ).run(hashPassword(password), user.id);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);

  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  const memberships = db
    .prepare("SELECT project_id FROM project_members WHERE user_id = ?")
    .all(req.user.id)
    .map((r) => r.project_id);

  res.json({ ...publicUser(req.user), projects: memberships });
});

/* ---------- Projekte ---------- */

app.get("/api/projects", requireAuth, (req, res) => {
  if (req.user.role === "admin") {
    return res.json(
      db
        .prepare(
          `SELECT p.*, COUNT(f.id) AS file_count, COALESCE(SUM(f.size), 0) AS total_size
           FROM projects p
           LEFT JOIN files f ON f.project_id = p.id
           GROUP BY p.id
           ORDER BY p.created_at DESC`
        )
        .all()
    );
  }

  const projects = db
    .prepare(
      `SELECT p.*, COUNT(f.id) AS file_count, COALESCE(SUM(f.size), 0) AS total_size
       FROM projects p
       JOIN project_members m ON m.project_id = p.id AND m.user_id = ?
       LEFT JOIN files f ON f.project_id = p.id
       GROUP BY p.id
       ORDER BY p.created_at DESC`
    )
    .all(req.user.id);

  res.json(projects);
});

app.patch("/api/projects/:projectId", requireAuth, requireAdmin, (req, res) => {
  const projectId = Number(req.params.projectId);
  const title = (req.body.title || "").trim();

  if (!title) {
    return res.status(400).json({ error: "Titel darf nicht leer sein" });
  }
  if (!db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId)) {
    return res.status(404).json({ error: "Projekt nicht gefunden" });
  }

  db.prepare("UPDATE projects SET title = ? WHERE id = ?").run(title, projectId);
  res.json(db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId));
});

app.post("/api/projects", requireAuth, requireAdmin, (req, res) => {
  const title = req.body.title || "Neues Projekt";
  const result = db.prepare("INSERT INTO projects (title) VALUES (?)").run(title);
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(result.lastInsertRowid);
  res.json(project);
});

app.delete("/api/projects/:projectId", requireAuth, requireAdmin, (req, res) => {
  const projectId = Number(req.params.projectId);

  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
  if (!project) {
    return res.status(404).json({ error: "Projekt nicht gefunden" });
  }

  db.prepare("DELETE FROM files WHERE project_id = ?").run(projectId);
  db.prepare("DELETE FROM project_members WHERE project_id = ?").run(projectId);
  db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);

  // Physische Dateien des Projekts entfernen (nur der eigene Unterordner).
  if (Number.isInteger(projectId) && projectId > 0) {
    const dir = path.join(storageDir, "projects", String(projectId));
    fs.rmSync(dir, { recursive: true, force: true });
  }

  if (project.image && project.image.startsWith("/storage/")) {
    const imagePath = path.resolve(path.join(__dirname, project.image.slice(1)));
    if (imagePath.startsWith(storageDir)) {
      fs.rmSync(imagePath, { force: true });
    }
  }

  res.json({ ok: true });
});

app.post(
  "/api/projects/:projectId/image",
  requireAuth,
  requireProjectAccess,
  projectImageUpload.single("image"),
  (req, res) => {
    const projectId = Number(req.params.projectId);

    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);

    if (!project) {
      return res.status(404).json({ error: "Projekt nicht gefunden" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Kein Bild übermittelt" });
    }

    const relativePath = `/storage/project-images/${req.file.filename}`;
    db.prepare("UPDATE projects SET image = ? WHERE id = ?").run(relativePath, projectId);

    res.json(db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId));
  }
);

/* ---------- Dateien ---------- */

app.get("/api/projects/:projectId/files", requireAuth, requireProjectAccess, (req, res) => {
  const files = db
    .prepare("SELECT * FROM files WHERE project_id = ? ORDER BY created_at DESC")
    .all(req.params.projectId);

  res.json(files);
});

app.post(
  "/api/projects/:projectId/upload",
  requireAuth,
  requireProjectAccess,
  upload.array("files"),
  (req, res) => {
    const projectId = Number(req.params.projectId);

    const insert = db.prepare(`
      INSERT INTO files
      (project_id, original_name, stored_name, mime_type, size, path, area, category, status, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const savedFiles = [];

    for (const file of req.files) {
      const relativePath = `/storage/projects/${projectId}/${file.filename}`;
      const category = categorizeFile(file.originalname, file.mimetype);

      const result = insert.run(
        projectId,
        file.originalname,
        file.filename,
        file.mimetype,
        file.size,
        relativePath,
        "uploads",
        category,
        "new",
        req.user.name
      );

      savedFiles.push(db.prepare("SELECT * FROM files WHERE id = ?").get(result.lastInsertRowid));
    }

    res.json(savedFiles);
  }
);

function getFileForUser(req, res) {
  const fileId = Number(req.params.fileId);
  const file = db.prepare("SELECT * FROM files WHERE id = ?").get(fileId);

  if (!file) {
    res.status(404).json({ error: "Datei nicht gefunden" });
    return null;
  }

  if (!canAccessProject(req.user, file.project_id)) {
    res.status(403).json({ error: "Kein Zugriff auf dieses Projekt" });
    return null;
  }

  return file;
}

app.get("/api/files/:fileId/download", requireAuth, (req, res) => {
  const file = getFileForUser(req, res);
  if (!file) return;

  if (!file.path || !file.path.startsWith("/storage/")) {
    return res.status(404).json({ error: "Datei fehlt" });
  }

  const filePath = path.resolve(path.join(__dirname, file.path.slice(1)));

  if (!filePath.startsWith(storageDir) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Datei fehlt" });
  }

  res.download(filePath, file.original_name);
});

app.patch("/api/files/:fileId", requireAuth, (req, res) => {
  const file = getFileForUser(req, res);
  if (!file) return;

  const name = (req.body.name || "").trim();

  if (!name) {
    return res.status(400).json({ error: "Name darf nicht leer sein" });
  }

  // Kategorie anhand des neuen Namens neu bestimmen (MIME bleibt gleich).
  const category = categorizeFile(name, file.mime_type);

  db.prepare("UPDATE files SET original_name = ?, category = ? WHERE id = ?").run(name, category, file.id);
  res.json(db.prepare("SELECT * FROM files WHERE id = ?").get(file.id));
});

app.post("/api/files/:fileId/move-to-show", requireAuth, (req, res) => {
  const file = getFileForUser(req, res);
  if (!file) return;

  if (!SHOW_CATEGORIES.includes(file.category)) {
    return res.status(400).json({ error: "Nur Video, Audio und Bilder können in die Show" });
  }

  db.prepare("UPDATE files SET area = 'show', status = 'ready' WHERE id = ?").run(file.id);
  res.json(db.prepare("SELECT * FROM files WHERE id = ?").get(file.id));
});

app.post("/api/files/:fileId/remove-from-show", requireAuth, (req, res) => {
  const file = getFileForUser(req, res);
  if (!file) return;

  db.prepare("UPDATE files SET area = 'uploads', status = 'new' WHERE id = ?").run(file.id);
  res.json(db.prepare("SELECT * FROM files WHERE id = ?").get(file.id));
});

app.delete("/api/files/:fileId", requireAuth, requireAdmin, (req, res) => {
  const fileId = Number(req.params.fileId);
  const file = db.prepare("SELECT * FROM files WHERE id = ?").get(fileId);

  if (!file) {
    return res.status(404).json({ error: "Datei nicht gefunden" });
  }

  if (file.path && file.path.startsWith("/storage/")) {
    const filePath = path.resolve(path.join(__dirname, file.path.slice(1)));
    if (filePath.startsWith(storageDir)) {
      fs.rmSync(filePath, { force: true });
    }
  }

  db.prepare("DELETE FROM files WHERE id = ?").run(fileId);
  res.json({ ok: true });
});

/* ---------- Admin ---------- */

app.get("/api/admin/users", requireAuth, requireAdmin, (req, res) => {
  const users = db.prepare("SELECT * FROM users ORDER BY created_at DESC").all();
  const memberships = db.prepare("SELECT user_id, project_id FROM project_members").all();

  res.json(
    users.map((u) => ({
      ...publicUser(u),
      projects: memberships.filter((m) => m.user_id === u.id).map((m) => m.project_id)
    }))
  );
});

app.post("/api/admin/users/:userId/verify", requireAuth, requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);

  if (!user) {
    return res.status(404).json({ error: "User nicht gefunden" });
  }

  db.prepare("UPDATE users SET email_verified = 1, verify_token = NULL WHERE id = ?").run(userId);
  res.json({ ok: true });
});

app.post("/api/admin/users/:userId/access", requireAuth, requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  const projectId = Number(req.body.projectId);
  const allowed = Boolean(req.body.allowed);

  if (!db.prepare("SELECT 1 FROM users WHERE id = ?").get(userId)) {
    return res.status(404).json({ error: "User nicht gefunden" });
  }
  if (!db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId)) {
    return res.status(404).json({ error: "Projekt nicht gefunden" });
  }

  if (allowed) {
    db.prepare("INSERT OR IGNORE INTO project_members (user_id, project_id) VALUES (?, ?)").run(userId, projectId);
  } else {
    db.prepare("DELETE FROM project_members WHERE user_id = ? AND project_id = ?").run(userId, projectId);
  }

  res.json({ ok: true });
});

app.post("/api/admin/users/:userId/reset-link", requireAuth, requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);

  if (!user) {
    return res.status(404).json({ error: "User nicht gefunden" });
  }

  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("UPDATE users SET reset_token = ?, reset_expires = datetime('now', '+2 hours') WHERE id = ?").run(
    token,
    userId
  );

  res.json({ link: `${APP_URL}/?reset=${token}` });
});

app.delete("/api/admin/users/:userId", requireAuth, requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);

  if (userId === req.user.id) {
    return res.status(400).json({ error: "Du kannst dich nicht selbst löschen" });
  }
  if (!db.prepare("SELECT 1 FROM users WHERE id = ?").get(userId)) {
    return res.status(404).json({ error: "User nicht gefunden" });
  }

  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM project_members WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);

  res.json({ ok: true });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Projekttool läuft auf Port ${PORT}${mailEnabled ? " (Mailversand aktiv)" : " (Mailversand deaktiviert – Admin bestätigt User manuell)"}`);
});
