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

    const nasaUrl = `https://ssd-api.jpl.nasa.gov/cad.api?date-min=${startDate}&date-max=${endDate}&diameter=true&fullname=true&dist-max=70LD&limit=1000`;
    const response = await fetch(nasaUrl);
    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  return new Response("Not Found", { status: 404 });
}
