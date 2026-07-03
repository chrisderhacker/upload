const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;

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
`);

const existingProject = db.prepare("SELECT * FROM projects LIMIT 1").get();

if (!existingProject) {
  db.prepare("INSERT INTO projects (title) VALUES (?)").run("Demo Projekt");
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/storage", express.static(storageDir));

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

app.get("/api/projects", (req, res) => {
  const projects = db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all();
  res.json(projects);
});

app.post("/api/projects", (req, res) => {
  const title = req.body.title || "Neues Projekt";
  const result = db.prepare("INSERT INTO projects (title) VALUES (?)").run(title);
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(result.lastInsertRowid);
  res.json(project);
});

app.get("/api/projects/:projectId/files", (req, res) => {
  const files = db
    .prepare("SELECT * FROM files WHERE project_id = ? ORDER BY created_at DESC")
    .all(req.params.projectId);

  res.json(files);
});

app.post("/api/projects/:projectId/upload", upload.array("files"), (req, res) => {
  const projectId = Number(req.params.projectId);

  const insert = db.prepare(`
    INSERT INTO files 
    (project_id, original_name, stored_name, mime_type, size, path)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const savedFiles = [];

  for (const file of req.files) {
    const relativePath = `/storage/projects/${projectId}/${file.filename}`;

    const result = insert.run(
      projectId,
      file.originalname,
      file.filename,
      file.mimetype,
      file.size,
      relativePath
    );

    savedFiles.push({
      id: result.lastInsertRowid,
      original_name: file.originalname,
      path: relativePath,
      mime_type: file.mimetype,
      size: file.size
    });
  }

  res.json(savedFiles);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Projekttool läuft auf Port ${PORT}`);
});
