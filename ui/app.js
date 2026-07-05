import * as THREE from "https://esm.sh/three@0.167.1";
import { GLTFExporter } from "https://esm.sh/three@0.167.1/examples/jsm/exporters/GLTFExporter.js";

const form = document.getElementById("convert-form");
const imageInput = document.getElementById("image-input");
const nameInput = document.getElementById("name-input");
const dropZone = document.getElementById("drop-zone");
const filePill = document.getElementById("file-pill");
const surfaceNote = document.getElementById("surface-note");
const convertButton = document.getElementById("convert-button");
const logPanel = document.getElementById("log-panel");
const stageList = document.getElementById("stage-list");
const resultCard = document.getElementById("result-card");
const resultLinks = document.getElementById("result-links");
const languageBar = document.getElementById("language-bar");
const signalState = document.getElementById("signal-state");
const modelPreview = document.getElementById("model-preview");
const previewEmpty = document.getElementById("preview-empty");
const previewStage = document.getElementById("preview-stage");

const useClientConversion =
  window.location.hostname.endsWith("github.io") || new URLSearchParams(window.location.search).get("client") === "1";
const stages = ["upload", "crop", "blender", "glb"];
const textureTarget = { width: 1024, height: 1280 };
const exporter = new GLTFExporter();
let activeUrls = [];

function setLog(message) {
  logPanel.textContent = message;
}

function clearStages() {
  [...stageList.querySelectorAll("li")].forEach((item) => {
    item.classList.remove("active", "done");
  });
}

function activateStage(name) {
  clearStages();
  stages.forEach((stage) => {
    const item = stageList.querySelector(`[data-stage="${stage}"]`);
    if (!item) return;
    if (stage === name) {
      item.classList.add("active");
    } else if (stages.indexOf(stage) < stages.indexOf(name)) {
      item.classList.add("done");
    }
  });
}

function setBar(mode, label) {
  languageBar.className = `language-bar ${mode}`;
  signalState.textContent = label;
}

function selectedFile() {
  return imageInput.files && imageInput.files[0] ? imageInput.files[0] : null;
}

function updateFilePill() {
  const file = selectedFile();
  filePill.textContent = file ? `${file.name} - ${(file.size / 1024 / 1024).toFixed(2)} MB` : "No image selected";
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "avatar";
}

function revokeActiveUrls() {
  activeUrls.forEach((url) => URL.revokeObjectURL(url));
  activeUrls = [];
}

function resetPreview() {
  revokeActiveUrls();
  modelPreview.removeAttribute("src");
  modelPreview.removeAttribute("poster");
  previewEmpty.hidden = false;
  previewEmpty.style.display = "";
  previewStage.classList.remove("is-ready");
}

function loadPreview(data) {
  modelPreview.src = data.downloadUrl;
  modelPreview.poster = data.faceTextureUrl;
  modelPreview.cameraOrbit = "20deg 74deg 2.9m";
  modelPreview.fieldOfView = "26deg";
  modelPreview.jumpCameraToGoal();
  previewEmpty.hidden = true;
  previewEmpty.style.display = "none";
  previewStage.classList.add("is-ready");
}

function applyClientMessaging() {
  if (!useClientConversion || !surfaceNote) return;
  surfaceNote.hidden = false;
  surfaceNote.textContent =
    "This public version runs entirely in your browser. Your photo stays on your device while the studio builds the GLB.";
  setLog("Browser studio ready.\nDrop in a JPG or PNG to build a stylized GLB avatar.");
}

function buildCropBox(width, height, targetRatio) {
  const sourceRatio = width / height;
  let cropWidth;
  let cropHeight;
  if (sourceRatio > targetRatio) {
    cropHeight = height;
    cropWidth = Math.round(height * targetRatio);
  } else {
    cropWidth = width;
    cropHeight = Math.round(width / targetRatio);
  }

  const left = Math.max(0, Math.floor((width - cropWidth) / 2));
  let top = Math.max(0, Math.min(height - cropHeight, Math.floor(height * 0.12)));
  if (height > cropHeight) {
    const centeredTop = Math.floor((height - cropHeight) / 2);
    top = Math.min(top, centeredTop);
  }

  return { left, top, cropWidth, cropHeight };
}

function canvasToBlob(canvas, type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not build the face texture."));
        return;
      }
      resolve(blob);
    }, type);
  });
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve(img);
    };
    img.onerror = () => {
      reject(new Error("The selected file could not be read as an image."));
    };
    img.src = URL.createObjectURL(file);
  });
}

async function buildFaceTextureCanvas(file) {
  const image = await fileToImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = textureTarget.width;
  canvas.height = textureTarget.height;
  const context = canvas.getContext("2d");
  const crop = buildCropBox(image.width, image.height, textureTarget.width / textureTarget.height);
  context.drawImage(
    image,
    crop.left,
    crop.top,
    crop.cropWidth,
    crop.cropHeight,
    0,
    0,
    textureTarget.width,
    textureTarget.height
  );
  URL.revokeObjectURL(image.src);
  return canvas;
}

function addBox(group, name, size, position, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.04 })
  );
  mesh.name = name;
  mesh.position.set(position[0], position[1], position[2]);
  group.add(mesh);
  return mesh;
}

function addSphere(group, name, radius, position, scale, material) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), material);
  mesh.name = name;
  mesh.position.set(position[0], position[1], position[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  group.add(mesh);
  return mesh;
}

async function exportGlb(root) {
  return new Promise((resolve, reject) => {
    exporter.parse(
      root,
      (result) => resolve(new Blob([result], { type: "model/gltf-binary" })),
      (error) => reject(error),
      { binary: true, onlyVisible: true }
    );
  });
}

async function buildClientAvatar(file, characterName) {
  const textureCanvas = await buildFaceTextureCanvas(file);
  const textureBlob = await canvasToBlob(textureCanvas, "image/png");

  const scene = new THREE.Scene();
  const avatar = new THREE.Group();
  avatar.name = characterName;
  scene.add(avatar);

  const skinMaterial = new THREE.MeshStandardMaterial({ color: "#a9836f", roughness: 0.94, metalness: 0.02 });
  const hairMaterial = new THREE.MeshStandardMaterial({ color: "#201813", roughness: 0.98 });

  addBox(avatar, "Torso", [0.5, 0.66, 0.28], [0, 1.18, 0], "#111c29");
  addBox(avatar, "Hips", [0.36, 0.22, 0.22], [0, 0.79, 0], "#0a1017");
  addBox(avatar, "ArmL", [0.15, 0.56, 0.16], [-0.36, 1.15, 0], "#111c29");
  addBox(avatar, "ArmR", [0.15, 0.56, 0.16], [0.36, 1.15, 0], "#111c29");
  addBox(avatar, "HandL", [0.11, 0.14, 0.09], [-0.36, 0.76, 0.02], "#a9836f");
  addBox(avatar, "HandR", [0.11, 0.14, 0.09], [0.36, 0.76, 0.02], "#a9836f");
  addBox(avatar, "LegL", [0.16, 0.66, 0.16], [-0.12, 0.36, 0], "#0a1017");
  addBox(avatar, "LegR", [0.16, 0.66, 0.16], [0.12, 0.36, 0], "#0a1017");
  addBox(avatar, "ShoeL", [0.19, 0.09, 0.3], [-0.12, -0.03, 0.07], "#edf2f5");
  addBox(avatar, "ShoeR", [0.19, 0.09, 0.3], [0.12, -0.03, 0.07], "#edf2f5");
  addBox(avatar, "Hood", [0.35, 0.32, 0.16], [0, 1.42, -0.12], "#111c29");

  const head = addSphere(avatar, "Head", 0.18, [0, 1.63, 0], [0.92, 0.84, 1.08], skinMaterial);
  head.rotation.x = -0.04;
  addSphere(avatar, "EarL", 0.04, [-0.16, 1.61, 0], [0.7, 1.0, 0.8], skinMaterial);
  addSphere(avatar, "EarR", 0.04, [0.16, 1.61, 0], [0.7, 1.0, 0.8], skinMaterial);
  addSphere(avatar, "HairCap", 0.17, [0, 1.72, -0.01], [1.0, 0.72, 0.85], hairMaterial);

  const faceTexture = new THREE.CanvasTexture(textureCanvas);
  faceTexture.colorSpace = THREE.SRGBColorSpace;
  faceTexture.flipY = false;
  faceTexture.needsUpdate = true;

  const facePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.3),
    new THREE.MeshStandardMaterial({ map: faceTexture, roughness: 0.9 })
  );
  facePlane.name = "FaceProjection";
  facePlane.position.set(0, 1.62, 0.155);
  avatar.add(facePlane);

  const glbBlob = await exportGlb(scene);
  const glbUrl = URL.createObjectURL(glbBlob);
  const textureUrl = URL.createObjectURL(textureBlob);
  activeUrls.push(glbUrl, textureUrl);

  return {
    name: characterName,
    downloadUrl: glbUrl,
    faceTextureUrl: textureUrl,
    stdout: [
      `Queued ${file.name}`,
      "Preparing face texture...",
      "Building stylized avatar mesh...",
      `GLB exported in browser as ${slugify(characterName)}.glb`,
    ].join("\n"),
  };
}

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("drag-over");
  if (!event.dataTransfer.files.length) return;
  imageInput.files = event.dataTransfer.files;
  updateFilePill();
});

imageInput.addEventListener("change", updateFilePill);

function renderResult(data) {
  resultLinks.innerHTML = "";
  const slug = slugify(data.name || "avatar");
  const links = [
    { href: data.downloadUrl, label: "Download GLB", download: `${slug}.glb` },
    { href: data.faceTextureUrl, label: "Download face texture", download: `${slug}-face-texture.png` },
    data.blendUrl ? { href: data.blendUrl, label: "Open .blend source" } : null,
  ].filter(Boolean);

  links.forEach((link) => {
    const anchor = document.createElement("a");
    anchor.href = link.href;
    anchor.textContent = link.label;
    if (link.download) {
      anchor.download = link.download;
    } else {
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
    }
    resultLinks.appendChild(anchor);
  });
  resultCard.hidden = false;
  loadPreview(data);
}

async function runServerConversion(file, characterName) {
  const payload = new FormData();
  payload.append("image", file);
  payload.append("name", characterName);

  window.setTimeout(() => {
    activateStage("crop");
    setBar("cropping busy", "Cropping");
    setLog(`Queued ${file.name}\nPreparing face texture...`);
  }, 250);

  window.setTimeout(() => {
    activateStage("blender");
    setBar("blender busy", "Blender");
    setLog(`Queued ${file.name}\nPreparing face texture...\nRunning Blender headless...`);
  }, 900);

  const response = await fetch("/api/convert", {
    method: "POST",
    body: payload,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.details || data.error || "Conversion failed.");
  }
  return data;
}

async function runClientConversion(file, characterName) {
  activateStage("crop");
  setBar("cropping busy", "Cropping");
  setLog(`Queued ${file.name}\nPreparing face texture...`);
  await new Promise((resolve) => window.setTimeout(resolve, 180));

  activateStage("blender");
  setBar("blender busy", "Modeling");
  setLog(`Queued ${file.name}\nPreparing face texture...\nBuilding stylized avatar mesh...`);
  await new Promise((resolve) => window.setTimeout(resolve, 180));

  return buildClientAvatar(file, characterName);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = selectedFile();
  if (!file) {
    setLog("Choose a JPG or PNG before starting the build.");
    return;
  }

  const characterName = nameInput.value.trim() || "Photo Avatar";
  resultCard.hidden = true;
  resetPreview();
  convertButton.disabled = true;
  convertButton.textContent = "Building...";
  setBar("busy", "Working");
  activateStage("upload");
  setLog(`Queued ${file.name}\nPreparing upload payload...`);

  try {
    const data = useClientConversion
      ? await runClientConversion(file, characterName)
      : await runServerConversion(file, characterName);

    activateStage("glb");
    [...stageList.querySelectorAll("li")].forEach((item) => item.classList.add("done"));
    setBar("done", "Ready");
    setLog(data.stdout || "GLB exported.");
    renderResult(data);
  } catch (error) {
    clearStages();
    setBar("idle", "Error");
    resetPreview();
    setLog(String(error.message || error));
  } finally {
    convertButton.disabled = false;
    convertButton.textContent = "Build GLB";
  }
});

resetPreview();
applyClientMessaging();
