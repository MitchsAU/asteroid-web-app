/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(req) {
  const url = new URL(req.url);

  if (url.pathname === "/api/asteroids") {
    const startDate = url.searchParams.get("startDate") || "2025-09-04";
    const endDate = url.searchParams.get("endDate") || "2025-10-04";

    const nasaUrl = `https://ssd-api.jpl.nasa.gov/cad.api?date-min=${startDate}&date-max=${endDate}&diameter=true&fullname=true&dist-max=70LD&limit=500`;
    const response = await fetch(nasaUrl);
    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  //Dashboard API
 if (url.pathname === "/api2/asteroids") {
  // Get current UTC time, then convert to Australia/Sydney
  const now = new Date();
  const options = { timeZone: "Australia/Sydney" };

  // Format to YYYY-MM-DD in Australian time
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);

  // Add 1 day (also in local time)
  const tomorrow = new Date(
    new Date(now.toLocaleString("en-US", { timeZone: "Australia/Sydney" }))
  );
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(tomorrow);

  const nasaUrl = `https://ssd-api.jpl.nasa.gov/cad.api?date-min=${todayStr}&date-max=${tomorrowStr}&diameter=true&fullname=true&dist-max=70LD&limit=500`;
  const response = await fetch(nasaUrl);
  const data = await response.json();

  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
  return new Response("Not Found", { status: 404 });
}
