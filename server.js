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

let archiver = null;
try {
  archiver = require("archiver");
} catch {
  archiver = null;
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

  CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT,
    UNIQUE(project_id, name)
  );

  CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    email TEXT,
    phone TEXT,
    notes TEXT,
    photo TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    user_id INTEGER,
    user_name TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    UNIQUE(project_id, category, path)
  );
`);

// Defensive Migration: neue Spalten nur ergänzen, wenn sie fehlen.
const fileColumns = db.prepare("PRAGMA table_info(files)").all().map((c) => c.name);

const newColumns = [
  ["area", "TEXT DEFAULT 'uploads'"],
  ["category", "TEXT"],
  ["status", "TEXT DEFAULT 'new'"],
  ["uploaded_by", "TEXT"],
  ["folder", "TEXT DEFAULT ''"],
  ["starred", "INTEGER DEFAULT 0"]
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

if (!projectColumns.includes("share_token")) {
  db.exec("ALTER TABLE projects ADD COLUMN share_token TEXT");
}

// Migration: playlists von "eine pro Projekt" (UNIQUE project_id) auf mehrere benannte pro Projekt.
const playlistsSchema = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'playlists'")
  .get();

if (playlistsSchema && /project_id\s+INTEGER\s+NOT\s+NULL\s+UNIQUE/i.test(playlistsSchema.sql)) {
  db.exec(`
    ALTER TABLE playlists RENAME TO playlists_old;
    CREATE TABLE playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT,
      UNIQUE(project_id, name)
    );
    INSERT INTO playlists (id, project_id, name, data, updated_at, updated_by)
      SELECT id, project_id, COALESCE(NULLIF(TRIM(name), ''), 'Playlist'), data, updated_at, updated_by
      FROM playlists_old;
    DROP TABLE playlists_old;
  `);
}

const userColumns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);

for (const [name, definition] of [["reset_token", "TEXT"], ["reset_expires", "TEXT"]]) {
  if (!userColumns.includes(name)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
  }
}

// Erweiterungs-Listen als Rückfallebene: manche Uploads (Ordner-Drag&Drop, manche Betriebssysteme/
// Dateitypen) liefern keinen oder nur einen generischen MIME-Type (z. B. "application/octet-stream").
// Ohne diesen Fallback landen solche Bilder/Videos fälschlich unter "Other" statt in ihrer echten Kategorie.
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".avif", ".heic", ".heif", ".tif", ".tiff"];
const VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv", ".mts", ".mxf"];
const AUDIO_EXTENSIONS = [".mp3", ".wav", ".aac", ".flac", ".ogg", ".m4a", ".aiff"];

function categorizeFile(originalName, mimeType) {
  const name = (originalName || "").toLowerCase();
  const mime = mimeType || "";
  const ext = path.extname(name);

  if ([".svg", ".eps", ".ai"].includes(ext)) return "logos";
  if (mime.startsWith("video/") || VIDEO_EXTENSIONS.includes(ext)) return "video";
  if (mime.startsWith("audio/") || AUDIO_EXTENSIONS.includes(ext)) return "audio";
  if (mime.startsWith("image/") || IMAGE_EXTENSIONS.includes(ext)) return "images";
  if ([".html", ".htm"].includes(ext)) return "html";
  if (/regie|ablauf|cue/.test(name)) return "regieplan";
  if ([".txt", ".doc", ".docx", ".pdf", ".xls", ".xlsx", ".csv", ".ppt", ".pptx", ".key", ".odp"].includes(ext)) return "text";
  return "other";
}

// Nur Video, Audio und Bilder dürfen in die Show.
const SHOW_CATEGORIES = ["video", "audio", "images"];

const ALL_CATEGORIES = new Set(["video", "audio", "images", "logos", "text", "regieplan", "html", "other"]);

// Normalisiert einen Ordnerpfad: keine leeren/„.."-Segmente, mit "/" verbunden.
function sanitizeFolderPath(raw) {
  return (raw || "")
    .split("/")
    .map((seg) => seg.trim())
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .join("/");
}

// Ein einzelnes Ordner-Segment (Name eines neuen Unterordners), keine Pfadtrennzeichen erlaubt.
function sanitizeFolderName(raw) {
  return (raw || "").trim().replace(/[\/\\]+/g, "");
}

const ensureFolderChain = db.transaction((projectId, category, path, userName) => {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO folders (project_id, category, path, created_by) VALUES (?, ?, ?, ?)"
  );
  let acc = "";
  for (const segment of path.split("/")) {
    acc = acc ? `${acc}/${segment}` : segment;
    insert.run(projectId, category, acc, userName);
  }
});

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

// Einmalige Korrektur: Dateien, die früher mangels MIME-Type als "Other" einsortiert wurden,
// obwohl ihre Dateiendung eindeutig Bild/Video/Audio ist (categorizeFile erkennt das jetzt auch
// per Endung). Ordner werden dabei in der neuen Kategorie nachgezogen, damit sie sichtbar bleiben.
const misclassified = db
  .prepare("SELECT id, project_id, original_name, mime_type, folder, uploaded_by FROM files WHERE category = 'other'")
  .all();

if (misclassified.length > 0) {
  const setCategory = db.prepare("UPDATE files SET category = ? WHERE id = ?");
  const reclassify = db.transaction((rows) => {
    for (const row of rows) {
      const newCategory = categorizeFile(row.original_name, row.mime_type);
      if (newCategory === "other") continue;

      setCategory.run(newCategory, row.id);
      if (row.folder) {
        ensureFolderChain(row.project_id, newCategory, row.folder, row.uploaded_by);
      }
    }
  });
  reclassify(misclassified);
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

/* ---------- Rollenmodell ----------
   admin      – darf alles
   partner    – wie User, darf zusätzlich Projekte anlegen und Dateien löschen
   user       – registrierter User: ansehen, hochladen, kommentieren, herunterladen
   spectator  – nur ansehen + kommentieren (kein Upload, kein Löschen)              */
const ROLES = ["admin", "partner", "user", "spectator"];

function normalizeRole(role) {
  return ROLES.includes(role) ? role : "user";
}

function canUpload(user) {
  return user.role !== "spectator";
}

function canDeleteFiles(user) {
  return user.role === "admin" || user.role === "partner";
}

function canCreateProject(user) {
  return user.role === "admin" || user.role === "partner";
}

// Alle angemeldeten Rollen dürfen kommentieren (auch Spectator).
function canComment(user) {
  return Boolean(user);
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

app.use(express.json({ limit: "25mb" }));
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

const personPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      const dir = path.join(storageDir, "people");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: function (req, file, cb) {
      const safeOriginal = file.originalname
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9._-]/g, "");

      cb(null, req.params.personId + "_" + Date.now() + "_" + safeOriginal);
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

app.post("/api/projects", requireAuth, (req, res) => {
  if (!canCreateProject(req.user)) {
    return res.status(403).json({ error: "Keine Berechtigung, Projekte anzulegen" });
  }

  const title = req.body.title || "Neues Projekt";
  const result = db.prepare("INSERT INTO projects (title) VALUES (?)").run(title);

  // Partner, die ein Projekt anlegen, werden direkt Mitglied (Admins sehen ohnehin alles).
  if (req.user.role !== "admin") {
    db.prepare("INSERT OR IGNORE INTO project_members (user_id, project_id) VALUES (?, ?)").run(
      req.user.id,
      result.lastInsertRowid
    );
  }

  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(result.lastInsertRowid);
  res.json(project);
});

app.delete("/api/projects/:projectId", requireAuth, requireAdmin, (req, res) => {
  const projectId = Number(req.params.projectId);

  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
  if (!project) {
    return res.status(404).json({ error: "Projekt nicht gefunden" });
  }

  // Personenfotos dieses Projekts physisch entfernen.
  const projectPeople = db.prepare("SELECT photo FROM people WHERE project_id = ?").all(projectId);
  for (const person of projectPeople) {
    if (person.photo && person.photo.startsWith("/storage/")) {
      const photoPath = path.resolve(path.join(__dirname, person.photo.slice(1)));
      if (photoPath.startsWith(storageDir)) {
        fs.rmSync(photoPath, { force: true });
      }
    }
  }

  db.prepare("DELETE FROM files WHERE project_id = ?").run(projectId);
  db.prepare("DELETE FROM folders WHERE project_id = ?").run(projectId);
  db.prepare("DELETE FROM people WHERE project_id = ?").run(projectId);
  db.prepare("DELETE FROM playlists WHERE project_id = ?").run(projectId);
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

/* ---------- Ordner ---------- */

app.get("/api/projects/:projectId/folders", requireAuth, requireProjectAccess, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM folders WHERE project_id = ? ORDER BY path COLLATE NOCASE ASC")
    .all(Number(req.params.projectId));

  res.json(rows);
});

app.post("/api/projects/:projectId/folders", requireAuth, requireProjectAccess, (req, res) => {
  if (!canUpload(req.user)) {
    return res.status(403).json({ error: "Zuschauer dürfen keine Ordner anlegen" });
  }

  const projectId = Number(req.params.projectId);
  const category = (req.body.category || "").trim();
  const parent = sanitizeFolderPath(req.body.parent);
  const name = sanitizeFolderName(req.body.name);

  if (!ALL_CATEGORIES.has(category)) {
    return res.status(400).json({ error: "Ungültige Kategorie" });
  }
  if (!name) {
    return res.status(400).json({ error: "Ordnername darf nicht leer sein" });
  }

  const folderPath = parent ? `${parent}/${name}` : name;

  // Alle Vorfahren-Segmente mit anlegen, damit die Navigation lückenlos bleibt.
  ensureFolderChain(projectId, category, folderPath, req.user.name);

  res.json(
    db
      .prepare("SELECT * FROM folders WHERE project_id = ? AND category = ? AND path = ?")
      .get(projectId, category, folderPath)
  );
});

app.delete("/api/folders/:folderId", requireAuth, (req, res) => {
  const folder = db.prepare("SELECT * FROM folders WHERE id = ?").get(Number(req.params.folderId));

  if (!folder) {
    return res.status(404).json({ error: "Ordner nicht gefunden" });
  }
  if (!canAccessProject(req.user, folder.project_id)) {
    return res.status(403).json({ error: "Kein Zugriff auf dieses Projekt" });
  }
  if (!canUpload(req.user)) {
    return res.status(403).json({ error: "Zuschauer dürfen keine Ordner löschen" });
  }

  const prefix = folder.path + "/";
  const hasFiles = db
    .prepare(
      "SELECT 1 FROM files WHERE project_id = ? AND category = ? AND (folder = ? OR folder LIKE ?) LIMIT 1"
    )
    .get(folder.project_id, folder.category, folder.path, prefix + "%");

  if (hasFiles) {
    return res.status(400).json({ error: "Ordner ist nicht leer" });
  }

  db.prepare("DELETE FROM folders WHERE project_id = ? AND category = ? AND (path = ? OR path LIKE ?)").run(
    folder.project_id,
    folder.category,
    folder.path,
    prefix + "%"
  );

  res.json({ ok: true });
});

/* ---------- Freigabe-Links (Lesezugriff ohne Login per Token) ---------- */

function canManageShare(user) {
  return user.role === "admin" || user.role === "partner";
}

function shareInfo(req, project) {
  const base = `${req.protocol}://${req.get("host")}`;
  return {
    token: project.share_token || null,
    url: project.share_token ? `${base}/s/${project.share_token}` : null
  };
}

app.get("/api/projects/:projectId/share", requireAuth, requireProjectAccess, (req, res) => {
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(Number(req.params.projectId));
  if (!project) return res.status(404).json({ error: "Projekt nicht gefunden" });
  res.json(shareInfo(req, project));
});

app.post("/api/projects/:projectId/share", requireAuth, requireProjectAccess, (req, res) => {
  if (!canManageShare(req.user)) {
    return res.status(403).json({ error: "Keine Berechtigung für Freigabe-Links" });
  }

  const projectId = Number(req.params.projectId);
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
  if (!project) return res.status(404).json({ error: "Projekt nicht gefunden" });

  let token = project.share_token;
  if (!token) {
    token = crypto.randomBytes(24).toString("hex");
    db.prepare("UPDATE projects SET share_token = ? WHERE id = ?").run(token, projectId);
    project.share_token = token;
  }

  res.json(shareInfo(req, project));
});

app.delete("/api/projects/:projectId/share", requireAuth, requireProjectAccess, (req, res) => {
  if (!canManageShare(req.user)) {
    return res.status(403).json({ error: "Keine Berechtigung für Freigabe-Links" });
  }

  db.prepare("UPDATE projects SET share_token = NULL WHERE id = ?").run(Number(req.params.projectId));
  res.json({ ok: true });
});

/* ---------- Öffentlicher Freigabe-Zugriff (kein Login, nur Lesen) ---------- */

function projectByShareToken(token) {
  if (!token || typeof token !== "string" || token.length < 16) return null;
  return db.prepare("SELECT * FROM projects WHERE share_token = ?").get(token);
}

// Statische Freigabe-Seite ausliefern.
app.get("/s/:token", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "share.html"));
});

// Metadaten + Dateiliste eines freigegebenen Projekts (nur Uploads-Bereich, ansehen).
app.get("/api/share/:token", (req, res) => {
  const project = projectByShareToken(req.params.token);
  if (!project) return res.status(404).json({ error: "Freigabe nicht gefunden" });

  const files = db
    .prepare("SELECT id, original_name, mime_type, size, category, folder, created_at FROM files WHERE project_id = ? ORDER BY created_at DESC")
    .all(project.id)
    .map((f) => ({
      id: f.id,
      original_name: f.original_name,
      mime_type: f.mime_type,
      size: f.size,
      category: f.category,
      folder: f.folder || "",
      created_at: f.created_at,
      url: `/api/share/${req.params.token}/file/${f.id}`
    }));

  const folders = db
    .prepare("SELECT id, category, path FROM folders WHERE project_id = ? ORDER BY path COLLATE NOCASE ASC")
    .all(project.id);

  res.json({ title: project.title, image: project.image || null, files, folders });
});

// Auslieferung einer Datei über den Freigabe-Token (inline, nur wenn zum Projekt gehörig).
app.get("/api/share/:token/file/:fileId", (req, res) => {
  const project = projectByShareToken(req.params.token);
  if (!project) return res.status(404).json({ error: "Freigabe nicht gefunden" });

  const file = db
    .prepare("SELECT * FROM files WHERE id = ? AND project_id = ?")
    .get(Number(req.params.fileId), project.id);

  if (!file || !file.path || !file.path.startsWith("/storage/")) {
    return res.status(404).json({ error: "Datei fehlt" });
  }

  const filePath = path.resolve(path.join(__dirname, file.path.slice(1)));
  if (!filePath.startsWith(storageDir) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Datei fehlt" });
  }

  res.sendFile(filePath, {
    headers: {
      "Content-Type": file.mime_type || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.original_name)}"`
    }
  });
});

/* ---------- Dateien ---------- */

app.get("/api/projects/:projectId/files", requireAuth, requireProjectAccess, (req, res) => {
  const files = db
    .prepare(
      `SELECT f.*, (SELECT COUNT(*) FROM comments c WHERE c.file_id = f.id) AS comment_count
       FROM files f WHERE f.project_id = ? ORDER BY f.created_at DESC`
    )
    .all(req.params.projectId);

  res.json(files);
});

app.post(
  "/api/projects/:projectId/upload",
  requireAuth,
  requireProjectAccess,
  (req, res, next) => {
    if (!canUpload(req.user)) {
      return res.status(403).json({ error: "Zuschauer dürfen keine Dateien hochladen" });
    }
    next();
  },
  upload.array("files"),
  (req, res) => {
    const projectId = Number(req.params.projectId);
    const defaultFolder = sanitizeFolderPath(req.body.folder);

    // Optional: pro Datei ein eigener Ordnerpfad (z. B. beim Hochladen eines ganzen Ordners),
    // parallel zur Reihenfolge von req.files. Fällt sonst auf den gemeinsamen "folder"-Wert zurück.
    let perFileFolders = null;
    if (req.body.folders) {
      try {
        const parsed = JSON.parse(req.body.folders);
        if (Array.isArray(parsed) && parsed.length === req.files.length) {
          perFileFolders = parsed.map((f) => sanitizeFolderPath(f));
        }
      } catch {
        perFileFolders = null;
      }
    }

    const insert = db.prepare(`
      INSERT INTO files
      (project_id, original_name, stored_name, mime_type, size, path, area, category, status, uploaded_by, folder)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const savedFiles = [];

    req.files.forEach((file, i) => {
      const relativePath = `/storage/projects/${projectId}/${file.filename}`;
      const category = categorizeFile(file.originalname, file.mimetype);
      const folder = perFileFolders ? perFileFolders[i] : defaultFolder;

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
        req.user.name,
        folder
      );

      if (folder) {
        ensureFolderChain(projectId, category, folder, req.user.name);
      }

      savedFiles.push(db.prepare("SELECT * FROM files WHERE id = ?").get(result.lastInsertRowid));
    });

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

  if (!canUpload(req.user)) {
    return res.status(403).json({ error: "Zuschauer dürfen die Show nicht ändern" });
  }

  if (!SHOW_CATEGORIES.includes(file.category)) {
    return res.status(400).json({ error: "Nur Video, Audio und Bilder können in die Show" });
  }

  db.prepare("UPDATE files SET area = 'show', status = 'ready' WHERE id = ?").run(file.id);
  res.json(db.prepare("SELECT * FROM files WHERE id = ?").get(file.id));
});

app.post("/api/files/:fileId/remove-from-show", requireAuth, (req, res) => {
  const file = getFileForUser(req, res);
  if (!file) return;

  if (!canUpload(req.user)) {
    return res.status(403).json({ error: "Zuschauer dürfen die Show nicht ändern" });
  }

  db.prepare("UPDATE files SET area = 'uploads', status = 'new' WHERE id = ?").run(file.id);
  res.json(db.prepare("SELECT * FROM files WHERE id = ?").get(file.id));
});

app.post("/api/files/:fileId/star", requireAuth, (req, res) => {
  const file = getFileForUser(req, res);
  if (!file) return;

  db.prepare("UPDATE files SET starred = ? WHERE id = ?").run(req.body.starred ? 1 : 0, file.id);
  res.json(db.prepare("SELECT * FROM files WHERE id = ?").get(file.id));
});

app.delete("/api/files/:fileId", requireAuth, (req, res) => {
  const fileId = Number(req.params.fileId);
  const file = db.prepare("SELECT * FROM files WHERE id = ?").get(fileId);

  if (!file) {
    return res.status(404).json({ error: "Datei nicht gefunden" });
  }

  if (!canDeleteFiles(req.user) || !canAccessProject(req.user, file.project_id)) {
    return res.status(403).json({ error: "Keine Berechtigung, diese Datei zu löschen" });
  }

  if (file.path && file.path.startsWith("/storage/")) {
    const filePath = path.resolve(path.join(__dirname, file.path.slice(1)));
    if (filePath.startsWith(storageDir)) {
      fs.rmSync(filePath, { force: true });
    }
  }

  db.prepare("DELETE FROM comments WHERE file_id = ?").run(fileId);
  db.prepare("DELETE FROM files WHERE id = ?").run(fileId);
  res.json({ ok: true });
});

/* ---------- Kommentare ---------- */

app.get("/api/files/:fileId/comments", requireAuth, (req, res) => {
  const file = getFileForUser(req, res);
  if (!file) return;

  const comments = db
    .prepare("SELECT * FROM comments WHERE file_id = ? ORDER BY created_at ASC")
    .all(file.id);

  res.json(comments);
});

app.post("/api/files/:fileId/comments", requireAuth, (req, res) => {
  const file = getFileForUser(req, res);
  if (!file) return;

  if (!canComment(req.user)) {
    return res.status(403).json({ error: "Keine Berechtigung zum Kommentieren" });
  }

  const body = (req.body.body || "").trim();
  if (!body) {
    return res.status(400).json({ error: "Kommentar darf nicht leer sein" });
  }
  if (body.length > 2000) {
    return res.status(400).json({ error: "Kommentar ist zu lang (max. 2000 Zeichen)" });
  }

  const result = db
    .prepare("INSERT INTO comments (file_id, user_id, user_name, body) VALUES (?, ?, ?, ?)")
    .run(file.id, req.user.id, req.user.name, body);

  res.status(201).json(db.prepare("SELECT * FROM comments WHERE id = ?").get(result.lastInsertRowid));
});

app.delete("/api/comments/:commentId", requireAuth, (req, res) => {
  const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(Number(req.params.commentId));

  if (!comment) {
    return res.status(404).json({ error: "Kommentar nicht gefunden" });
  }

  const file = db.prepare("SELECT * FROM files WHERE id = ?").get(comment.file_id);
  if (!file || !canAccessProject(req.user, file.project_id)) {
    return res.status(403).json({ error: "Kein Zugriff" });
  }

  // Autor darf den eigenen Kommentar löschen, Admin/Partner jeden.
  const isAuthor = comment.user_id === req.user.id;
  if (!isAuthor && req.user.role !== "admin" && req.user.role !== "partner") {
    return res.status(403).json({ error: "Nur eigene Kommentare löschbar" });
  }

  db.prepare("DELETE FROM comments WHERE id = ?").run(comment.id);
  res.json({ ok: true });
});

// Alle Dateien eines Projekts als ZIP herunterladen.
app.get("/api/projects/:projectId/download-all", requireAuth, requireProjectAccess, (req, res) => {
  if (!archiver) return res.status(501).json({ error: "ZIP-Download nicht verfügbar (archiver fehlt)" });

  const projectId = Number(req.params.projectId);
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
  if (!project) return res.status(404).json({ error: "Projekt nicht gefunden" });

  const files = db
    .prepare("SELECT * FROM files WHERE project_id = ? ORDER BY original_name COLLATE NOCASE")
    .all(projectId);

  const cleanZip = String(project.title || "projekt").normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "projekt";
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${cleanZip}.zip"`);

  const archive = archiver("zip", { zlib: { level: 5 } });
  archive.on("error", () => { try { res.status(500).end(); } catch (e) {} });
  archive.pipe(res);

  const used = {};
  for (const f of files) {
    if (!f.path || !f.path.startsWith("/storage/")) continue;
    const fp = path.resolve(path.join(__dirname, f.path.slice(1)));
    if (!fp.startsWith(storageDir) || !fs.existsSync(fp)) continue;
    let name = f.original_name || path.basename(fp);
    if (used[name]) {
      const ext = path.extname(name);
      name = name.slice(0, name.length - ext.length) + "_" + used[name]++ + ext;
    } else {
      used[name] = 1;
    }
    archive.file(fp, { name });
  }
  archive.finalize();
});

/* ---------- Player / Playlists ---------- */

// Liefert die Show-Dateien eines Projekts als fertige Player-Clips.
app.get("/api/projects/:projectId/player-data", requireAuth, requireProjectAccess, (req, res) => {
  const projectId = Number(req.params.projectId);
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);

  if (!project) {
    return res.status(404).json({ error: "Projekt nicht gefunden" });
  }

  const typeByCategory = { video: "video", audio: "audio", images: "image" };

  const clips = db
    .prepare("SELECT * FROM files WHERE project_id = ? AND area = 'show' ORDER BY created_at ASC")
    .all(projectId)
    .filter((f) => typeByCategory[f.category])
    .map((f) => ({
      type: typeByCategory[f.category],
      fileName: f.original_name,
      mime: f.mime_type || "",
      relativePath: f.path,
      thumbnail: "",
      isLoop: false,
      endMode: "hold",
      startMode: "cue",
      transitionMode: "off",
      markColor: ""
    }));

  res.json({ projectTitle: project.title, clips });
});

function playlistSummary(row) {
  let clipCount = null;
  try {
    clipCount = JSON.parse(row.data).clips.length;
  } catch {
    clipCount = null;
  }
  return { id: row.id, name: row.name, updated_at: row.updated_at, updated_by: row.updated_by, clipCount };
}

app.get("/api/projects/:projectId/playlists", requireAuth, requireProjectAccess, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM playlists WHERE project_id = ? ORDER BY updated_at DESC")
    .all(Number(req.params.projectId));

  res.json(rows.map(playlistSummary));
});

function getPlaylistForUser(req, res) {
  const row = db.prepare("SELECT * FROM playlists WHERE id = ?").get(Number(req.params.playlistId));

  if (!row) {
    res.status(404).json({ error: "Playlist nicht gefunden" });
    return null;
  }

  if (!canAccessProject(req.user, row.project_id)) {
    res.status(403).json({ error: "Kein Zugriff auf dieses Projekt" });
    return null;
  }

  return row;
}

app.get("/api/playlists/:playlistId", requireAuth, (req, res) => {
  const row = getPlaylistForUser(req, res);
  if (!row) return;

  let payload;
  try {
    payload = JSON.parse(row.data);
  } catch {
    return res.status(500).json({ error: "Gespeicherte Playlist ist beschädigt" });
  }

  res.json({ id: row.id, name: row.name, updated_at: row.updated_at, updated_by: row.updated_by, payload });
});

// Speichern per Name: gleicher Name überschreibt, neuer Name legt eine neue Playlist an.
app.put("/api/projects/:projectId/playlists", requireAuth, requireProjectAccess, (req, res) => {
  const projectId = Number(req.params.projectId);
  const name = (req.body.name || "").trim() || "Playlist";
  const payload = req.body.payload;

  if (!payload || !Array.isArray(payload.clips)) {
    return res.status(400).json({ error: "Ungültige Playlist-Daten" });
  }

  db.prepare(
    `INSERT INTO playlists (project_id, name, data, updated_at, updated_by)
     VALUES (?, ?, ?, datetime('now'), ?)
     ON CONFLICT(project_id, name) DO UPDATE SET
       data = excluded.data,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`
  ).run(projectId, name, JSON.stringify(payload), req.user.name);

  const row = db.prepare("SELECT * FROM playlists WHERE project_id = ? AND name = ?").get(projectId, name);
  res.json({ ok: true, ...playlistSummary(row) });
});

app.delete("/api/playlists/:playlistId", requireAuth, (req, res) => {
  const row = getPlaylistForUser(req, res);
  if (!row) return;

  db.prepare("DELETE FROM playlists WHERE id = ?").run(row.id);
  res.json({ ok: true });
});

/* ---------- People ---------- */

function getPersonForUser(req, res) {
  const personId = Number(req.params.personId);
  const person = db.prepare("SELECT * FROM people WHERE id = ?").get(personId);

  if (!person) {
    res.status(404).json({ error: "Person nicht gefunden" });
    return null;
  }

  if (!canAccessProject(req.user, person.project_id)) {
    res.status(403).json({ error: "Kein Zugriff auf dieses Projekt" });
    return null;
  }

  return person;
}

app.get("/api/projects/:projectId/people", requireAuth, requireProjectAccess, (req, res) => {
  const people = db
    .prepare("SELECT * FROM people WHERE project_id = ? ORDER BY name COLLATE NOCASE ASC")
    .all(req.params.projectId);

  res.json(people);
});

app.post("/api/projects/:projectId/people", requireAuth, requireProjectAccess, (req, res) => {
  const projectId = Number(req.params.projectId);
  const name = (req.body.name || "").trim();

  if (!name) {
    return res.status(400).json({ error: "Name darf nicht leer sein" });
  }

  const result = db
    .prepare(
      `INSERT INTO people (project_id, name, role, email, phone, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      projectId,
      name,
      (req.body.role || "").trim() || null,
      (req.body.email || "").trim() || null,
      (req.body.phone || "").trim() || null,
      (req.body.notes || "").trim() || null,
      req.user.name
    );

  res.json(db.prepare("SELECT * FROM people WHERE id = ?").get(result.lastInsertRowid));
});

app.patch("/api/people/:personId", requireAuth, (req, res) => {
  const person = getPersonForUser(req, res);
  if (!person) return;

  const name = (req.body.name || "").trim();
  if (!name) {
    return res.status(400).json({ error: "Name darf nicht leer sein" });
  }

  db.prepare(
    "UPDATE people SET name = ?, role = ?, email = ?, phone = ?, notes = ? WHERE id = ?"
  ).run(
    name,
    (req.body.role || "").trim() || null,
    (req.body.email || "").trim() || null,
    (req.body.phone || "").trim() || null,
    (req.body.notes || "").trim() || null,
    person.id
  );

  res.json(db.prepare("SELECT * FROM people WHERE id = ?").get(person.id));
});

app.post(
  "/api/people/:personId/photo",
  requireAuth,
  (req, res, next) => {
    // Zugriff prüfen, bevor Multer die Datei schreibt.
    if (!getPersonForUser(req, res)) return;
    next();
  },
  personPhotoUpload.single("photo"),
  (req, res) => {
    const personId = Number(req.params.personId);

    if (!req.file) {
      return res.status(400).json({ error: "Kein Bild übermittelt" });
    }

    const relativePath = `/storage/people/${req.file.filename}`;
    db.prepare("UPDATE people SET photo = ? WHERE id = ?").run(relativePath, personId);

    res.json(db.prepare("SELECT * FROM people WHERE id = ?").get(personId));
  }
);

app.delete("/api/people/:personId", requireAuth, (req, res) => {
  const person = getPersonForUser(req, res);
  if (!person) return;

  if (person.photo && person.photo.startsWith("/storage/")) {
    const photoPath = path.resolve(path.join(__dirname, person.photo.slice(1)));
    if (photoPath.startsWith(storageDir)) {
      fs.rmSync(photoPath, { force: true });
    }
  }

  db.prepare("DELETE FROM people WHERE id = ?").run(person.id);
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

app.post("/api/admin/users", requireAuth, requireAdmin, (req, res) => {
  const name = (req.body.name || "").trim();
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";
  const role = normalizeRole(req.body.role);
  const projectIds = Array.isArray(req.body.projectIds)
    ? req.body.projectIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
    : [];

  if (!name || !email || !email.includes("@")) {
    return res.status(400).json({ error: "Bitte Name und gültige E-Mail angeben" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Passwort muss mindestens 8 Zeichen haben" });
  }
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
    return res.status(409).json({ error: "Diese E-Mail ist bereits registriert" });
  }

  const validProjectIds = projectIds.filter((projectId) =>
    db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId)
  );

  const createUser = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO users (name, email, password_hash, role, email_verified, verify_token)
         VALUES (?, ?, ?, ?, 1, NULL)`
      )
      .run(name, email, hashPassword(password), role);

    const userId = result.lastInsertRowid;

    if (role !== "admin") {
      const addMembership = db.prepare("INSERT OR IGNORE INTO project_members (user_id, project_id) VALUES (?, ?)");
      for (const projectId of validProjectIds) {
        addMembership.run(userId, projectId);
      }
    }

    return userId;
  });

  const userId = createUser();
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);

  res.status(201).json({
    ...publicUser(user),
    projects: role === "admin" ? [] : validProjectIds
  });
});

app.patch("/api/admin/users/:userId", requireAuth, requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);

  if (!user) {
    return res.status(404).json({ error: "User nicht gefunden" });
  }

  const name = (req.body.name || "").trim();
  const email = (req.body.email || "").trim().toLowerCase();
  const role = normalizeRole(req.body.role);
  const password = req.body.password || "";

  if (!name || !email || !email.includes("@")) {
    return res.status(400).json({ error: "Bitte Name und gültige E-Mail angeben" });
  }
  if (password && password.length < 8) {
    return res.status(400).json({ error: "Passwort muss mindestens 8 Zeichen haben" });
  }

  const emailOwner = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (emailOwner && emailOwner.id !== userId) {
    return res.status(409).json({ error: "Diese E-Mail ist bereits vergeben" });
  }

  // Der letzte Admin darf sich nicht selbst degradieren, sonst gibt es keinen Admin mehr.
  if (user.role === "admin" && role !== "admin") {
    const adminCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get().c;
    if (adminCount <= 1) {
      return res.status(400).json({ error: "Der letzte Admin kann nicht herabgestuft werden" });
    }
  }

  db.prepare("UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?").run(name, email, role, userId);

  if (password) {
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), userId);
    // Nach Passwortwechsel alle Sessions dieses Users beenden.
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }

  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  const projects = db
    .prepare("SELECT project_id FROM project_members WHERE user_id = ?")
    .all(userId)
    .map((r) => r.project_id);

  res.json({ ...publicUser(updated), projects });
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

/* ---------- SHOW-Feed (toolübergreifend: Regieplan liest SHOW-Dateien) ---------- */
// Cross-Domain-Zugriff nur über geheimen Key (Feed/Projektliste) bzw. HMAC-Token pro
// Datei (Auslieferung). Bestehende Login-/Cookie-Logik bleibt unangetastet.
const SHOW_FEED_KEY = process.env.SHOW_FEED_KEY || "";

function showConfigured() {
  return Boolean(SHOW_FEED_KEY);
}

function timingEqual(a, b) {
  const bufA = Buffer.from(String(a || ""));
  const bufB = Buffer.from(String(b || ""));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function validShowKey(key) {
  return showConfigured() && timingEqual(key, SHOW_FEED_KEY);
}

// Pro Datei ein abgeleiteter Token – so landet der Master-Key nie in gespeicherten Plänen.
function showToken(id) {
  return crypto.createHmac("sha256", SHOW_FEED_KEY).update("show:" + id).digest("hex").slice(0, 32);
}

function validShowToken(id, token) {
  return showConfigured() && timingEqual(token, showToken(id));
}

function showCors(res) {
  // Zugriff ist bereits durch Key/Token geschützt, daher ist ein offener Origin unkritisch
  // und erspart Origin-Matching (lokales Testen, regie.derhacker.com).
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

app.options("/api/show/*", (req, res) => {
  showCors(res);
  res.sendStatus(204);
});

// Projekte, die überhaupt SHOW-Medien haben (für das Dropdown im Regieplan).
app.get("/api/show/projects", (req, res) => {
  showCors(res);
  if (!showConfigured()) return res.status(503).json({ error: "SHOW-Feed nicht konfiguriert" });
  if (!validShowKey(req.query.key)) return res.status(401).json({ error: "Ungültiger Key" });

  const rows = db
    .prepare(
      `SELECT p.id AS id, p.title AS title, COUNT(f.id) AS showCount
       FROM projects p
       JOIN files f ON f.project_id = p.id AND f.area = 'show' AND f.category IN ('video','audio','images')
       GROUP BY p.id, p.title
       ORDER BY p.title COLLATE NOCASE`
    )
    .all();

  res.json({ projects: rows });
});

// SHOW-Dateien eines Projekts als fertige Clips (gleiche Form wie die Player-Playlist).
app.get("/api/show/feed", (req, res) => {
  showCors(res);
  if (!showConfigured()) return res.status(503).json({ error: "SHOW-Feed nicht konfiguriert" });
  if (!validShowKey(req.query.key)) return res.status(401).json({ error: "Ungültiger Key" });

  const projectId = Number(req.query.project);
  if (!projectId) return res.status(400).json({ error: "Kein Projekt angegeben" });

  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
  if (!project) return res.status(404).json({ error: "Projekt nicht gefunden" });

  const typeByCategory = { video: "video", audio: "audio", images: "image" };

  const clips = db
    .prepare("SELECT * FROM files WHERE project_id = ? AND area = 'show' ORDER BY created_at ASC")
    .all(projectId)
    .filter((f) => typeByCategory[f.category])
    .map((f) => ({
      id: f.id,
      type: typeByCategory[f.category],
      name: f.original_name,
      mime: f.mime_type || "",
      relativePath: f.path,
      isLoop: false,
      thumbnail: "",
      url: `${APP_URL}/api/show/file/${f.id}?t=${showToken(f.id)}`
    }));

  res.json({ projectId: project.id, projectTitle: project.title, clips });
});

// Auslieferung der eigentlichen Datei – nur mit gültigem, pro-Datei-Token (inline, Range-fähig).
app.get("/api/show/file/:id", (req, res) => {
  showCors(res);
  if (!showConfigured()) return res.status(503).json({ error: "SHOW-Feed nicht konfiguriert" });

  const id = Number(req.params.id);
  if (!validShowToken(id, req.query.t)) return res.status(403).json({ error: "Ungültiger Token" });

  const file = db.prepare("SELECT * FROM files WHERE id = ? AND area = 'show'").get(id);
  if (!file) return res.status(404).json({ error: "Datei nicht in der Show" });
  if (!file.path || !file.path.startsWith("/storage/")) return res.status(404).json({ error: "Datei fehlt" });

  const filePath = path.resolve(path.join(__dirname, file.path.slice(1)));
  if (!filePath.startsWith(storageDir) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Datei fehlt" });
  }

  res.sendFile(filePath, {
    headers: {
      "Content-Type": file.mime_type || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.original_name)}"`,
      "Cache-Control": "public, max-age=300"
    }
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Projekttool läuft auf Port ${PORT}${mailEnabled ? " (Mailversand aktiv)" : " (Mailversand deaktiviert – Admin bestätigt User manuell)"}`);
  console.log(`SHOW-Feed: ${showConfigured() ? "aktiv" : "deaktiviert (SHOW_FEED_KEY fehlt)"}`);
});
