import * as THREE from "three";
import { OrbitControls } from "jsm/controls/OrbitControls.js";
import getStarfield from "./src/getStarfield.js";
import { getFresnelMat } from "./src/getFresnelMat.js";
import { GLTFLoader } from "jsm/loaders/GLTFLoader.js";

const gltfLoader = new GLTFLoader();
const w = window.innerWidth;
const h = window.innerHeight;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, w / h, 0.01, 1000);
camera.position.z = 3;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(w, h);
document.body.appendChild(renderer.domElement);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

const earthGroup = new THREE.Group();
earthGroup.rotation.z = -23.4 * Math.PI / 180;
scene.add(earthGroup);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.03;

const loader = new THREE.TextureLoader();
const geometry = new THREE.IcosahedronGeometry(1, 12);
const material = new THREE.MeshStandardMaterial({
  map: loader.load("./textures/earth.jpg"),
});
const earthMesh = new THREE.Mesh(geometry, material);
earthGroup.add(earthMesh);

const lightsMat = new THREE.MeshBasicMaterial({
  map: loader.load("./textures/nightlights.jpg"),
  blending: THREE.AdditiveBlending,
});
const lightsMesh = new THREE.Mesh(geometry, lightsMat);
earthGroup.add(lightsMesh);

const cloudMat = new THREE.MeshStandardMaterial({
  map: loader.load("./textures/clouds.jpg"),
  transparent: true,
  opacity: 0.6,
});
const cloudMesh = new THREE.Mesh(geometry, cloudMat);
cloudMesh.scale.setScalar(1.005);
earthGroup.add(cloudMesh);

const fresnelMat = getFresnelMat();
const glowMesh = new THREE.Mesh(geometry, fresnelMat);
earthGroup.add(glowMesh);

const stars = getStarfield({ numStars: 3000 });
scene.add(stars);

const sunLight = new THREE.DirectionalLight(0xffffff, 3);
sunLight.position.set(-2, 0.5, 1.5);
scene.add(sunLight);

// --- Create comet-like trail ---
function createTrail(startPos, direction, length = 20, color = 0xffaa44) {
  const positions = new Float32Array(length * 3);
  for (let i = 0; i < length; i++) {
    const offset = direction.clone().multiplyScalar(-i * 0.05);
    positions[i * 3] = startPos.x + offset.x;
    positions[i * 3 + 1] = startPos.y + offset.y;
    positions[i * 3 + 2] = startPos.z + offset.z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.4,
  });
  return new THREE.Line(geometry, material);
}

// --- Estimate diameter from absolute magnitude h ---
function estimateDiameter(h, albedo = 0.14) {
  return (1329 / Math.sqrt(albedo)) * Math.pow(10, -0.2 * h);
}

// --- Fill missing diameters and convert to meters ---
function fillMissingDiameters(asteroidData) {
  return asteroidData.map(item => {
    const diameterKm = item.diameter ? parseFloat(item.diameter) : estimateDiameter(Number(item.h));
    item.diameter = diameterKm * 1000; // meters
    return item;
  });
}

let allAsteroids = []; // All fetched from API
const asteroids = [];  // Meshes in scene

let lastStartDate = "";
let lastEndDate = "";

// --- Fetch asteroid data from API ---
// --- Fetch asteroid data from API ---
function clearAsteroids() {
  asteroids.forEach(a => {
    scene.remove(a.mesh);
    scene.remove(a.trail);
  });
  asteroids.length = 0;
}

// --- Fetch asteroid data from API ---
function fetchAsteroids() {
  const startDate = document.getElementById("startDate").value;
  const endDate = document.getElementById("endDate").value;

  // Only fetch if date actually changed
  if (startDate === lastStartDate && endDate === lastEndDate) {
    applyFilters();
    return;
  }

  lastStartDate = startDate;
  lastEndDate = endDate;

  // const url = `http://localhost:3000/api/asteroids?ts=${Date.now()}&startDate=${startDate}&endDate=${endDate}`;
  const url = `http://asteroid-worker.skeltonmitchell41.workers.dev//api/asteroids?ts=${Date.now()}&startDate=${startDate}&endDate=${endDate}`;

  fetch(url)
    .then(res => res.json())
    .then(rawData => {
      const fields = rawData.fields;
      const asteroidArray = rawData.data.map(entry => {
        const obj = {};
        fields.forEach((f, i) => (obj[f] = entry[i]));
        return obj;
      });

      allAsteroids = fillMissingDiameters(asteroidArray);
      clearAsteroids();
      createAsteroids(allAsteroids, true); // create meshes
      applyFilters(); // immediately apply other filters
    })
    .catch(err => console.error("❌ Error fetching asteroid data:", err));
}

// --- Apply live filters (size, speed, distance) ---
function applyFilters() {
  const minDiameter = parseFloat(document.getElementById("minDiameter").value) || 0;
  const maxDiameter = parseFloat(document.getElementById("maxDiameter").value) || Infinity;
  const minSpeed = parseFloat(document.getElementById("minSpeed").value) || 0;
  const maxSpeed = parseFloat(document.getElementById("maxSpeed").value) || Infinity;
  const minDistance = parseFloat(document.getElementById("minDistance").value) || 0;
  const maxDistance = parseFloat(document.getElementById("maxDistance").value) || Infinity;

  asteroids.forEach(a => {
    const d = a.data.diameter;
    const v = a.data.velocity;
    const dist = a.data.dist;

    const show =
      d >= minDiameter &&
      d <= maxDiameter &&
      v >= minSpeed &&
      v <= maxSpeed &&
      dist >= minDistance &&
      dist <= maxDistance;

    a.mesh.visible = show;
    a.trail.visible = show;
  });
}

// --- Create asteroid meshes ---
function createAsteroids(asteroidData, storeMeshes = false) {
  const earthRadius = 1;
  const auToLd = 389.17;

  asteroidData.forEach(data => {
    const distAU = parseFloat(data.dist);
    if (isNaN(distAU) || distAU <= 0) return;

    const distLD = distAU * auToLd;
    const diameterM = parseFloat(data.diameter);
    const velocity = parseFloat(data.v_rel) || 0.0001;
    const name = (data.fullname || "Unnamed").replace(/[()]/g, "").trim(); // Remove brackets from names, as if i use "des" on older asteroids names can be different and not consistant
    const closeapproachDate = data.cd || "Unknown";

    const angle = Math.random() * Math.PI * 2;
    const height = (Math.random() - 0.5) * 5.5;

    gltfLoader.load("./models/alp2.glb", gltf => {
      const mesh = gltf.scene.clone();
      mesh.scale.setScalar(diameterM * 0.00001 + 0.001);

      mesh.position.set(
        Math.cos(angle) * (earthRadius + distLD),
        height,
        Math.sin(angle) * (earthRadius + distLD)
      );

      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );

      const trail = createTrail(mesh.position, new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)).normalize());

      scene.add(mesh);
      scene.add(trail);

      if (storeMeshes) {
        asteroids.push({
          mesh,
          trail,
          data: { name, dist: distLD, diameter: diameterM, velocity, closeapproachDate }
        });
      }
    });
  });
}

// --- Event listeners ---
document.getElementById("applyDates").addEventListener("click", () => {
  fetchAsteroids(); // Fetch only when Apply button is clicked
});

// Live filter updates for everything else
document.querySelectorAll("#filters input").forEach(input => {
  const id = input.id;
  if (id !== "startDate" && id !== "endDate") {
    input.addEventListener("input", applyFilters);
  }
});

// --- Initial load ---
fetchAsteroids();

// --- Popup ---
const popup = document.getElementById("asteroid-popup");
let selectedAsteroid = null;

function onMouseClick(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const asteroidMeshes = asteroids.filter(a => a.mesh.visible).map(a => a.mesh);
  const intersects = raycaster.intersectObjects(asteroidMeshes, true);

  if (intersects.length > 0) {
    const clickedMesh = intersects[0].object;
    let root = clickedMesh;
    while (root.parent && !asteroids.find(a => a.mesh === root)) root = root.parent;
    selectedAsteroid = asteroids.find(a => a.mesh === root);

    if (selectedAsteroid) {
      const data = selectedAsteroid.data;
      const dateStr = data.closeapproachDate.split(".")[0];
      popup.innerHTML = `
        <b>${data.name}</b><br>
        Distance: ${data.dist.toFixed(3)} LD<br>
        Diameter: ${data.diameter.toFixed(0)} m<br>
        Speed: ${data.velocity.toFixed(2)} km/s <br>
        Close-Approach Date: ${dateStr}
      `;
      popup.style.display = "block";
    }
  } else {
    selectedAsteroid = null;
    popup.style.display = "none";
  }
}
window.addEventListener("click", onMouseClick, false);

function setupFilterUI() {
  const panel = document.getElementById("filter-panel");
  const tab = document.getElementById("filter-tab");

  tab.addEventListener("click", () => {
    panel.classList.toggle("collapsed");

    // Update tab icon
    tab.textContent = panel.classList.contains("collapsed") ? "❮" : "❯";
  });
}
window.addEventListener("DOMContentLoaded", setupFilterUI);

function bindRangePair(minSlider, maxSlider, minInput, maxInput, callback) {
  const minGap = 1; // minimum distance between sliders

  const syncFromSliders = () => {
    let minVal = parseFloat(minSlider.value);
    let maxVal = parseFloat(maxSlider.value);

    // Prevent crossing
    if (maxVal - minVal <= minGap) {
      if (event.target === minSlider) {
        minVal = maxVal - minGap;
        minSlider.value = minVal;
      } else {
        maxVal = minVal + minGap;
        maxSlider.value = maxVal;
      }
    }

    // Sync inputs
    minInput.value = minVal;
    maxInput.value = maxVal;

    callback();
  };

  const syncFromInputs = () => {
    let minVal = parseFloat(minInput.value);
    let maxVal = parseFloat(maxInput.value);

    // Clamp to min/max and prevent overlap
    if (maxVal - minVal <= minGap) {
      if (event.target === minInput) {
        minVal = maxVal - minGap;
        minInput.value = minVal;
      } else {
        maxVal = minVal + minGap;
        maxInput.value = maxVal;
      }
    }

    // Keep values within slider range
    minVal = Math.max(parseFloat(minSlider.min), Math.min(minVal, parseFloat(minSlider.max)));
    maxVal = Math.max(parseFloat(maxSlider.min), Math.min(maxVal, parseFloat(maxSlider.max)));

    // Sync sliders
    minSlider.value = minVal;
    maxSlider.value = maxVal;

    callback();
  };

  // Bind events
  minSlider.addEventListener("input", syncFromSliders);
  maxSlider.addEventListener("input", syncFromSliders);
  minInput.addEventListener("input", syncFromInputs);
  maxInput.addEventListener("input", syncFromInputs);
}

bindRangePair(
  document.getElementById("minDiameterSlider"),
  document.getElementById("maxDiameterSlider"),
  document.getElementById("minDiameter"),
  document.getElementById("maxDiameter"),
  applyFilters
);

bindRangePair(
  document.getElementById("minSpeedSlider"),
  document.getElementById("maxSpeedSlider"),
  document.getElementById("minSpeed"),
  document.getElementById("maxSpeed"),
  applyFilters
);

bindRangePair(
  document.getElementById("minDistanceSlider"),
  document.getElementById("maxDistanceSlider"),
  document.getElementById("minDistance"),
  document.getElementById("maxDistance"),
  applyFilters
);

document.getElementById("resetFilters").addEventListener("click", () => {
  const resetValues = {
    minDiameter: 0,
    maxDiameter: 1000,
    minSpeed: 0,
    maxSpeed: 50,
    minDistance: 0,
    maxDistance: 70,
  };

  Object.entries(resetValues).forEach(([id, val]) => {
    document.getElementById(id).value = val;
    const slider = document.getElementById(id + "Slider");
    if (slider) slider.value = val;
  });

  applyFilters();
});


// --- Animate ---
function animate() {
  requestAnimationFrame(animate);

  earthMesh.rotation.y += 0.001;
  lightsMesh.rotation.y += 0.001;
  cloudMesh.rotation.y += 0.0012;
  glowMesh.rotation.y += 0.001;

  if (selectedAsteroid) {
    const vector = selectedAsteroid.mesh.position.clone().project(camera);
    const x = (vector.x + 1) / 2 * window.innerWidth;
    const y = (-vector.y + 1) / 2 * window.innerHeight;
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
  }

  renderer.render(scene, camera);
  controls.update();
}

animate();

function handleWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", handleWindowResize, false);