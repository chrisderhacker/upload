let currentProjectId = null;

const projectList = document.getElementById("projectList");
const projectTitle = document.getElementById("projectTitle");
const newProjectBtn = document.getElementById("newProjectBtn");
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const fileGrid = document.getElementById("fileGrid");

async function loadProjects() {
  const res = await fetch("/api/projects");
  const projects = await res.json();

  projectList.innerHTML = "";

  for (const project of projects) {
    const btn = document.createElement("button");
    btn.className = "project-btn";
    btn.textContent = project.title;
    btn.onclick = () => selectProject(project);
    projectList.appendChild(btn);
  }

  if (!currentProjectId && projects[0]) {
    selectProject(projects[0]);
  }
}

async function selectProject(project) {
  currentProjectId = project.id;
  projectTitle.textContent = project.title;
  await loadFiles();
}

async function loadFiles() {
  if (!currentProjectId) return;

  const res = await fetch(`/api/projects/${currentProjectId}/files`);
  const files = await res.json();

  fileGrid.innerHTML = "";

  for (const file of files) {
    const card = document.createElement("div");
    card.className = "file-card";

    const preview = createPreview(file);

    const name = document.createElement("div");
    name.className = "file-name";
    name.textContent = file.original_name;

    card.appendChild(preview);
    card.appendChild(name);

    fileGrid.appendChild(card);
  }
}

function createPreview(file) {
  const wrap = document.createElement("div");
  wrap.className = "preview";

  if (file.mime_type && file.mime_type.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = file.path;
    img.loading = "lazy";
    wrap.appendChild(img);
  } else if (file.mime_type && file.mime_type.startsWith("video/")) {
    const video = document.createElement("video");
    video.src = file.path;
    video.controls = true;
    video.preload = "metadata";
    wrap.appendChild(video);
  } else if (file.mime_type && file.mime_type.startsWith("audio/")) {
    const audio = document.createElement("audio");
    audio.src = file.path;
    audio.controls = true;
    wrap.appendChild(audio);
  } else {
    const icon = document.createElement("div");
    icon.className = "file-icon";
    icon.textContent = "FILE";
    wrap.appendChild(icon);
  }

  return wrap;
}

async function uploadFiles(files) {
  if (!currentProjectId) return;

  const formData = new FormData();

  for (const file of files) {
    formData.append("files", file);
  }

  await fetch(`/api/projects/${currentProjectId}/upload`, {
    method: "POST",
    body: formData
  });

  await loadFiles();
}

newProjectBtn.onclick = async () => {
  const title = prompt("Projektname?");
  if (!title) return;

  const res = await fetch("/api/projects", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ title })
  });

  const project = await res.json();
  await loadProjects();
  selectProject(project);
};

dropzone.onclick = () => fileInput.click();

fileInput.onchange = () => {
  uploadFiles(fileInput.files);
};

dropzone.ondragover = (event) => {
  event.preventDefault();
  dropzone.classList.add("is-dragover");
};

dropzone.ondragleave = () => {
  dropzone.classList.remove("is-dragover");
};

dropzone.ondrop = (event) => {
  event.preventDefault();
  dropzone.classList.remove("is-dragover");
  uploadFiles(event.dataTransfer.files);
};

loadProjects();
