import express from "express";
import fetch from "node-fetch";

const app = express();

app.get("/api/asteroids", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Default date range if not provided
    const dateMin = startDate || "2025-09-04";
    const dateMax = endDate || "2025-10-04";

    const url = `https://ssd-api.jpl.nasa.gov/cad.api?date-min=${dateMin}&date-max=${dateMax}&diameter=true&fullname=true&dist-max=70LD&limit=1000`;

    const response = await fetch(url);
    const data = await response.json();

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch data from NASA" });
  }
});

app.listen(3000, () => console.log("✅ Proxy running on port 3000"));
