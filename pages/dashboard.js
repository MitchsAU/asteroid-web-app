document.addEventListener("DOMContentLoaded", async () => {
  const liveCountEl = document.getElementById("liveCount");
  const fastestTodaySpeedEl = document.getElementById("fastestTodaySpeed");
  const fastestTodayNameEl = document.getElementById("fastestTodayName");
  const closestTodayDistanceEl = document.getElementById("closestTodayDistance");
  const closestTodayNameEl = document.getElementById("closestTodayName");
  const largestTodaySizeEl = document.getElementById("largestTodaySize");
  const largestTodayNameEl = document.getElementById("largestTodayName");
  const recentApproachesEl = document.getElementById("recentApproaches");
  const lastUpdatedEl = document.getElementById("lastUpdated");
  const exploreBtn = document.getElementById("exploreBtn");

  exploreBtn.addEventListener("click", () => {
    window.location.href = "asteroidApp.html";
  });

  function estimateDiameter(h, albedo = 0.14) {
    return (1329 / Math.sqrt(albedo)) * Math.pow(10, -0.2 * h);
  }

  // Get today and tomorrow
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  const pad = (n) => n.toString().padStart(2, "0");

  const startDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const endDate = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;

  // const url = `http://localhost:3000/api2/asteroids?date-min=${startDate}&date-max=${endDate}`;
  const url = `https://asteroid-worker.skeltonmitchell41.workers.dev/api2/asteroids?date-min=${startDate}&date-max=${endDate}`;
 

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!data || !data.data) throw new Error("No data returned");

    const fields = data.fields;
    const desIdx = fields.indexOf("des");
    const fullnameIdx = fields.indexOf("fullname");
    const distIdx = fields.indexOf("dist");
    const diameterIdx = fields.indexOf("diameter");
    const hIdx = fields.indexOf("h");
    const dateIdx = fields.indexOf("cd");
    const speedIdx = fields.indexOf("v_rel"); // relative velocity

    const approaches = data.data.map(item => {
      let name = item[fullnameIdx] || item[desIdx] || "Unknown";
      name = name.replace(/[()]/g, "").trim(); // remove brackets

      const distanceAU = parseFloat(item[distIdx]);
      const distanceLD = distanceAU / 0.00257; // AU → LD
      const h = parseFloat(item[hIdx]);
      const speed = parseFloat(item[speedIdx]); // km/s
      let diameter = item[diameterIdx] ? parseFloat(item[diameterIdx]) : null;

      if (!diameter && !isNaN(h)) {
        diameter = estimateDiameter(h);
      }

      return {
        name,
        distanceLD,
        size: diameter ? (diameter * 1000).toFixed(0) : null, // m
        speed,
        date: item[dateIdx],
      };
    });

    const valid = approaches.filter(a => !isNaN(a.distanceLD));

    // Fastest asteroid
    const fastest = valid.length
      ? valid.reduce((a, b) => (parseFloat(a.speed) > parseFloat(b.speed) ? a : b))
      : null;

    // Closest asteroid
    const closest = valid.length
      ? valid.reduce((a, b) => (a.distanceLD < b.distanceLD ? a : b))
      : null;

    // Largest asteroid
    const largest = valid.length
      ? valid.reduce((a, b) => (parseFloat(a.size) > parseFloat(b.size) ? a : b))
      : null;

    // Update dashboard
    liveCountEl.textContent = data.count?.toLocaleString() || "0";

    // Fastest Today
    fastestTodaySpeedEl.textContent = fastest?.speed ? `${fastest.speed.toFixed(2)} km/s` : "—";
    fastestTodayNameEl.textContent = fastest?.name || "—";

    closestTodayDistanceEl.textContent = closest ? `${closest.distanceLD.toFixed(2)} LD` : "—";
    closestTodayNameEl.textContent = closest?.name || "—";

    largestTodaySizeEl.textContent = largest?.size ? `${largest.size} m` : "—";
    largestTodayNameEl.textContent = largest?.name || "—";

    // Recent Approaches (max 4)
    recentApproachesEl.innerHTML = valid.slice(0, 4).map(a => {
      let dateObj = new Date(a.date);
      let options = {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      };
      let formattedDate = dateObj.toLocaleString("en-US", options).replace(",", "");

      lastUpdatedEl.textContent = `Last updated: ${new Date().toLocaleString("en-US", options)}`;
      
      return `
        <div class="col-12 col-md-6">
          <div class="recent-card d-flex justify-content-between align-items-start gap-2">
            <div class="d-flex gap-2">
              <div class="dot mt-1 me-1"></div>
              <div>
                <div class="fw-bold">${a.name}</div>
                <div class="text-white-50 small">${formattedDate}</div>
              </div>
            </div>
            <div class="text-end">
              <div class="text-white fw-bold small">${a.distanceLD.toFixed(2)} LD</div>
              <div class="text-white-50 small">${a.size} m diameter</div>
            </div>
          </div>
        </div>
      `;
    }).join("");

  } catch (error) {
    console.error("Error fetching data:", error);
    recentApproachesEl.innerHTML = '<div class="text-danger">Failed to load asteroid data.</div>';
  }
});
