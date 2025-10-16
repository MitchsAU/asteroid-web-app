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

const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
scene.add(ambientLight);

// Cool blue backlight (space reflection)
const blueLight = new THREE.DirectionalLight(0x88ccff, 0.25);
blueLight.position.set(2, -0.5, -1.5);
scene.add(blueLight);

// Create Moon
const moonTexture = new THREE.TextureLoader().load("./textures/8k_moon.jpg");
const moonGeo = new THREE.SphereGeometry(0.27, 64, 64);
const moonMat = new THREE.MeshStandardMaterial({ map: moonTexture });
const moon = new THREE.Mesh(moonGeo, moonMat);

// Position Moon 1 LD away from Earth
moon.position.set(2, 0, 0);
scene.add(moon);

// Moon Orbit Path
const moonOrbitRadius = 2;
const inclination = THREE.MathUtils.degToRad(5.145); // Moon's orbit angle

const orbitCurve = new THREE.EllipseCurve(
  0, 0,            
  moonOrbitRadius, moonOrbitRadius,
  0, 2 * Math.PI, 
  false,           
  0                
);

const orbitPoints = orbitCurve.getPoints(100);
const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints.map(p => new THREE.Vector3(p.x, 0, p.y)));
const orbitMaterial = new THREE.LineBasicMaterial({ color: 0x888888 });
const moonOrbitLine = new THREE.LineLoop(orbitGeometry, orbitMaterial);

// Rotate the orbit line to match the Moon's angle
moonOrbitLine.rotation.x = inclination;

scene.add(moonOrbitLine);

// ASteroid Trail for direction
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

// Estimate diameter from absolute magnitude h
function estimateDiameter(h, albedo = 0.14) {
  return (1329 / Math.sqrt(albedo)) * Math.pow(10, -0.2 * h);
}

// Fill missing diameters and convert to meters
function fillMissingDiameters(asteroidData) {
  return asteroidData.map(item => {
    const diameterKm = item.diameter ? parseFloat(item.diameter) : estimateDiameter(Number(item.h));
    item.diameter = diameterKm * 1000; // meters
    return item;
  });
}

let allAsteroids = [];
const asteroids = [];

let lastStartDate = "";
let lastEndDate = "";

// Clear asteroids from scene
function clearAsteroids() {
  asteroids.forEach(a => {
    scene.remove(a.mesh);
    scene.remove(a.trail);
  });
  asteroids.length = 0;
}

function setDefaultDates() {
  const end = new Date();
  const start = new Date();
  start.setMonth(end.getMonth() - 1);
  const formatDate = date => date.toISOString().split("T")[0];
  document.getElementById("startDate").value = formatDate(start);
  document.getElementById("endDate").value = formatDate(end);
}

// Initial load
window.addEventListener("DOMContentLoaded", () => {
  setDefaultDates();

  const applyBtn = document.getElementById("applyDates");
  if (applyBtn) applyBtn.addEventListener("click", fetchAsteroids);

  fetchAsteroids();
});

// Fetch asteroid data from API
async function fetchAsteroids() {
  const startDate = document.getElementById("startDate").value;
  const endDate = document.getElementById("endDate").value;

  // avoid double calls
  if (isLoading) return;

  const applyBtn = document.getElementById("applyDates") || document.getElementById("applyDatesBtn");

  try {
    isLoading = true;
    if (applyBtn) applyBtn.disabled = true;

    showLoader();

    // Only fetch if date actually changed
    if (startDate === lastStartDate && endDate === lastEndDate) {
      applyFilters();
      return;
    }

    lastStartDate = startDate;
    lastEndDate = endDate;

    // const url = `http://localhost:3000/api/asteroids?ts=${Date.now()}&startDate=${startDate}&endDate=${endDate}`;
    const url = `https://asteroid-worker.skeltonmitchell41.workers.dev/api/asteroids?ts=${Date.now()}&startDate=${startDate}&endDate=${endDate}`;

    const res = await fetch(url);
    const rawData = await res.json();

    const fields = rawData.fields;
    const asteroidArray = rawData.data.map(entry => {
      const obj = {};
      fields.forEach((f, i) => (obj[f] = entry[i]));
      return obj;
    });

    allAsteroids = fillMissingDiameters(asteroidArray);

    clearAsteroids();

    // Wait for all models to load before continuing
    await createAsteroids(allAsteroids, true);

    applyFilters();
  } catch (err) {
    console.error("❌ Error fetching asteroid data:", err);
  } finally {
    hideLoader();
    isLoading = false;
    if (applyBtn) applyBtn.disabled = false;
  }
}

// Apply live filters (size, speed, distance)
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

let isLoading = false;

function showLoader() {
  const loader = document.getElementById("asteroid-loader");
  if (!loader) return;
  loader.style.display = "flex";
  loader.classList.remove("hidden");
  loader.style.pointerEvents = "all"; // block clicks in scene if loader is active
}

let instructionShown = false;

function hideLoader() {
  const loader = document.getElementById("asteroid-loader");
  if (!loader) return;
  loader.classList.add("hidden");
  loader.style.pointerEvents = "none";

  setTimeout(() => {
    loader.style.display = "none";

    if (!instructionShown) {
      instructionShown = true;

      const modalEl = document.getElementById("instructionModal");
      if (modalEl) {
        const modal = new bootstrap.Modal(modalEl, { backdrop: "static", keyboard: true });
        modal.show();
      }
    }
  }, 400);
}

document.addEventListener("DOMContentLoaded", () => {
  const pages = document.querySelectorAll(".instruction-page");
  const nextBtn = document.getElementById("nextPageBtn");
  const prevBtn = document.getElementById("prevPageBtn");
  const noShowMdl = document.getElementById("dontShowAgainBtn");
  let currentPage = 0;

  function showPage(index) {
    pages.forEach((page, i) => {
      if (i === index) {
        page.classList.remove("d-none");
        setTimeout(() => page.classList.add("active"), 50);
      } else {
        page.classList.remove("active");
        page.classList.add("d-none");
      }
    });

    prevBtn.style.display = index === 0 ? "none" : "inline-block";
    nextBtn.textContent = index === pages.length - 1 ? "Got it!" : "Next";
  }

  nextBtn.addEventListener("click", () => {
    if (currentPage < pages.length - 1) {
      currentPage++;
      showPage(currentPage);
    } else {
      // Close modal when finished
      const modalEl = document.getElementById("instructionModal");
      const modal = bootstrap.Modal.getInstance(modalEl);
      modal.hide();
    }
  });

  prevBtn.addEventListener("click", () => {
    if (currentPage > 0) {
      currentPage--;
      showPage(currentPage);
    }
  });

  noShowMdl.addEventListener("click", () => {
    const modalEl = document.getElementById("instructionModal");
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();
  })

  showPage(0); // initialize first page
});

// Create asteroid meshes
function createAsteroids(asteroidData, storeMeshes = false) {
  const earthRadius = 1;
  const auToLd = 389.17;

  const loadPromises = asteroidData.map(data => {
    return new Promise(resolve => {
      const distAU = parseFloat(data.dist);
      if (isNaN(distAU) || distAU <= 0) return resolve();

      const distLD = distAU * auToLd;
      const diameterM = parseFloat(data.diameter);
      const velocity = parseFloat(data.v_rel) || 0.0001;
      const name = (data.fullname || "Unnamed").replace(/[()]/g, "").trim();
      const closeapproachDate = data.cd || "Unknown";

      const angle = Math.random() * Math.PI * 2;
      const height = (Math.random() - 0.5) * 5.5;

      gltfLoader.load(
        "./models/alp2.glb",
        (gltf) => {
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

          const trail = createTrail(
            mesh.position,
            new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)).normalize()
          );

          scene.add(mesh);
          scene.add(trail);

          if (storeMeshes) {
            asteroids.push({
              mesh,
              trail,
              data: { name, dist: distLD, diameter: diameterM, velocity, closeapproachDate }
            });
          }

          resolve();
        },
        undefined,
        (err) => {
          console.error("Error loading model:", err);
          // resolve anyway so one failed model doesn't hang everything
          resolve();
        }
      );
    });
  });

  return Promise.all(loadPromises);
}

document.getElementById("applyDates").addEventListener("click", () => {
  fetchAsteroids();
});

// Live filter updates
document.querySelectorAll("#filters input").forEach(input => {
  const id = input.id;
  if (id !== "startDate" && id !== "endDate") {
    input.addEventListener("input", applyFilters);
  }
});

// ASteroid Popup
const popup = document.getElementById("asteroid-popup");
let selectedAsteroid = null;
const originalColors = new Map();

function highlightAsteroid(asteroid) {
  if (!asteroid) return;

  asteroid.mesh.traverse(child => {
    if (child.isMesh && child.material && child.material.color) {
      if (!originalColors.has(child)) {
        originalColors.set(child, child.material.color.clone());
      }
      child.material.color.set(0xffff00); // Highlight color
    }
  });
}

function unhighlightAsteroid(asteroid) {
  if (!asteroid) return;

  asteroid.mesh.traverse(child => {
    if (child.isMesh && child.material && child.material.color && originalColors.has(child)) {
      child.material.color.copy(originalColors.get(child)); // Restore original
      originalColors.delete(child);
    }
  });
}

window.closePopup = function () {
  const popup = document.getElementById("asteroid-popup");
  popup.style.display = "none";

  if (selectedAsteroid) {
    unhighlightAsteroid(selectedAsteroid);
    selectedAsteroid = null;
  }
};

let lastClickTime = 0;

function onMouseClick(event) {
  const now = Date.now();
  const doubleClick = now - lastClickTime < 300; // within 300ms = double-click
  lastClickTime = now;

  // Check if click was over the filter panel or tab (ignore clicks there)
  const panel = document.getElementById("filter-panel");
  const tab = document.getElementById("filter-tab");

  const rectsToIgnore = [panel, tab].map(el => el.getBoundingClientRect());
  const clickedInIgnoredArea = rectsToIgnore.some(rect =>
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
  if (clickedInIgnoredArea) return; // ignore clicks through the UI

  // Handle double-click to close popup
  if (doubleClick) {
    if (selectedAsteroid) {
      unhighlightAsteroid(selectedAsteroid);
      selectedAsteroid = null;
    }
    popup.style.display = "none";
    return;
  }

  // Handle single click (select asteroid)
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const asteroidMeshes = asteroids.filter(a => a.mesh.visible).map(a => a.mesh);
  const intersects = raycaster.intersectObjects(asteroidMeshes, true);

  if (intersects.length > 0) {
    const clickedMesh = intersects[0].object;
    let root = clickedMesh;
    while (root.parent && !asteroids.find(a => a.mesh === root)) root = root.parent;
    const asteroid = asteroids.find(a => a.mesh === root);

    if (asteroid) {
      // Unhighlight previous asteroid
      if (selectedAsteroid && selectedAsteroid !== asteroid) {
        unhighlightAsteroid(selectedAsteroid);
      }

      selectedAsteroid = asteroid;
      highlightAsteroid(selectedAsteroid);

      const data = asteroid.data;
      const dateStr = data.closeapproachDate.split(".")[0];
      const date = new Date(dateStr);
      const options = {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      };
      const formattedDate = date.toLocaleString("en-US", options).replace(",", "");

      popup.innerHTML = `
        <div class="popup position-fixed" onclick="event.stopPropagation()">
          <div class="card text-white bg-dark bg-opacity-50 border-light border-1 border-opacity-25 shadow-lg p-2 rounded-4" style="backdrop-filter: blur(15px); width: 18rem;">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h5 class="mb-0">${data.name}</h5>
              <button type="button" class="btn-close btn-close-white" aria-label="Close" onclick="event.stopPropagation(); closePopup();"></button>
            </div>
            <div class="card-body p-2">
              <div class="mb-2 p-2 rounded bg-light bg-opacity-10 d-flex justify-content-between align-items-center">
                <div><i class="bi bi-speedometer2 text-warning me-2"></i> Speed</div>
                <div>${data.velocity.toFixed(2)} km/s</div>
              </div>
              <div class="mb-2 p-2 rounded bg-light bg-opacity-10 d-flex justify-content-between align-items-center">
                <div><i class="bi bi-rulers text-primary me-2"></i> Diameter</div>
                <div>${data.diameter.toFixed(0)} m</div>
              </div>
              <div class="mb-2 p-2 rounded bg-light bg-opacity-10 d-flex justify-content-between align-items-center">
                <div><i class="bi bi-globe icon-purple me-2"></i> Distance</div>
                <div class="text-end">
                  <div>${data.dist.toFixed(3)} LD</div>
                  <div class="small text-white-50">${Math.round(data.dist * 384400).toLocaleString()} km</div>
                </div>
              </div>
              <div class="p-2 rounded bg-light bg-opacity-10 d-flex justify-content-between align-items-center">
                <div><i class="bi bi-calendar-event text-success me-2"></i> Approach</div>
                <div>${formattedDate}</div>
              </div>
            </div>
          </div>
        </div>
      `;
      popup.style.display = "block";
    }
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
    maxDiameter: 2000,
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

// Animate Moon Speed
const moonOrbitSpeed = 0.2;
const orbitInclinationMatrix = new THREE.Matrix4().makeRotationX(inclination);

function animate() {
  requestAnimationFrame(animate);

  // Earth rotation
  earthMesh.rotation.y += 0.001;
  lightsMesh.rotation.y += 0.001;
  cloudMesh.rotation.y += 0.0012;
  glowMesh.rotation.y += 0.001;

  // Moon orbit along the angles path
  const time = Date.now() * 0.0001;
  const angle = time * moonOrbitSpeed;

  const pos = new THREE.Vector3(
    Math.cos(angle) * moonOrbitRadius,
    0,
    Math.sin(angle) * moonOrbitRadius
  );

  // Apply angle rotation
  pos.applyMatrix4(orbitInclinationMatrix);

  // Set Moon position
  moon.position.copy(pos);

  // Tidal locking (making the moons face always face the same side to earth)
  moon.lookAt(earthMesh.position);

  // Asteroid popup positioning
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

// Link to dashboard
document.getElementById("backToDashboard").addEventListener("click", () => {
    window.location.href = "index.html"; 
  });
