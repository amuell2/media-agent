import express, { Request, Response } from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3002;

app.use(cors());
app.use(express.json());

// Load mock database
const dbPath = path.join(__dirname, "../media-database/db.json");
let db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));

// Health check
app.get("/health", (req: Request, res: Response) => {
  res.json({ ok: true, service: "streaming-api" });
});

// Get all active streams
app.get("/api/streams", (req: Request, res: Response) => {
  const activeStreams = db.streams.filter((s: any) =>
    db.broadcasts.find(
      (b: any) => b.id === s.broadcastId && b.status === "live",
    ),
  );

  res.json({
    streams: activeStreams,
    total: activeStreams.length,
  });
});

// Get stream by ID
app.get("/api/streams/:streamId", (req: Request, res: Response) => {
  const stream = db.streams.find((s: any) => s.id === req.params.streamId);

  if (!stream) {
    return res.status(404).json({ error: "Stream not found" });
  }

  const broadcast = db.broadcasts.find((b: any) => b.id === stream.broadcastId);
  const channel = db.channels.find((c: any) => c.id === stream.channelId);

  res.json({
    stream,
    broadcast,
    channel,
  });
});

// Get stream health metrics
app.get("/api/streams/:streamId/health", (req: Request, res: Response) => {
  const stream = db.streams.find((s: any) => s.id === req.params.streamId);

  if (!stream) {
    return res.status(404).json({ error: "Stream not found" });
  }

  // Simulate real-time health data with slight variations
  const health = {
    ...stream.health,
    timestamp: new Date().toISOString(),
    latency: stream.health.latency + (Math.random() - 0.5) * 0.5,
    bufferHealth: Math.min(
      100,
      stream.health.bufferHealth + (Math.random() - 0.5) * 5,
    ),
    droppedFrames: stream.health.droppedFrames + Math.floor(Math.random() * 3),
    networkJitter: stream.health.networkJitter + (Math.random() - 0.5) * 0.3,
  };

  res.json(health);
});

// Start a new stream
app.post("/api/streams/start", (req: Request, res: Response) => {
  const { channelId, broadcastId, protocol = "RTMP", quality } = req.body;

  const channel = db.channels.find((c: any) => c.id === channelId);
  if (!channel) {
    return res.status(404).json({ error: "Channel not found" });
  }

  const newStream = {
    id: `st_${Date.now()}`,
    broadcastId,
    channelId,
    protocol,
    ingestUrl: `${protocol.toLowerCase()}://ingest.example.com/live/${channel.streamKey}`,
    playbackUrls: {
      hls: `https://cdn.example.com/live/${channel.name.replace(/\s+/g, "")}/playlist.m3u8`,
      dash: `https://cdn.example.com/live/${channel.name.replace(/\s+/g, "")}/manifest.mpd`,
      rtmp: `rtmp://streaming.example.com/live/${channel.name.replace(/\s+/g, "")}`,
    },
    quality: quality || {
      resolution: "1920x1080",
      bitrate: 6000,
      fps: 60,
      codec: "H.264",
    },
    health: {
      status: "healthy",
      latency: 2.0 + Math.random(),
      bufferHealth: 95 + Math.random() * 5,
      droppedFrames: 0,
      networkJitter: 0.5 + Math.random() * 0.5,
    },
    startedAt: new Date().toISOString(),
  };

  db.streams.push(newStream);

  // Update channel status
  const channelIndex = db.channels.findIndex((c: any) => c.id === channelId);
  db.channels[channelIndex].status = "active";

  res.status(201).json({
    message: "Stream started successfully",
    stream: newStream,
  });
});

// Stop a stream
app.post("/api/streams/:streamId/stop", (req: Request, res: Response) => {
  const streamIndex = db.streams.findIndex(
    (s: any) => s.id === req.params.streamId,
  );

  if (streamIndex === -1) {
    return res.status(404).json({ error: "Stream not found" });
  }

  const stream = db.streams[streamIndex];
  const endedAt = new Date().toISOString();

  // Update broadcast status
  const broadcastIndex = db.broadcasts.findIndex(
    (b: any) => b.id === stream.broadcastId,
  );
  if (broadcastIndex !== -1) {
    db.broadcasts[broadcastIndex].status = "completed";
    db.broadcasts[broadcastIndex].actualEndAt = endedAt;
  }

  // Remove stream from active list
  db.streams.splice(streamIndex, 1);

  res.json({
    message: "Stream stopped successfully",
    streamId: req.params.streamId,
    endedAt,
  });
});

// Update stream quality
app.patch("/api/streams/:streamId/quality", (req: Request, res: Response) => {
  const streamIndex = db.streams.findIndex(
    (s: any) => s.id === req.params.streamId,
  );

  if (streamIndex === -1) {
    return res.status(404).json({ error: "Stream not found" });
  }

  const { resolution, bitrate, fps } = req.body;

  if (resolution) db.streams[streamIndex].quality.resolution = resolution;
  if (bitrate) db.streams[streamIndex].quality.bitrate = bitrate;
  if (fps) db.streams[streamIndex].quality.fps = fps;

  res.json({
    message: "Stream quality updated",
    quality: db.streams[streamIndex].quality,
  });
});

// Get stream statistics (last 5 minutes)
app.get("/api/streams/:streamId/stats", (req: Request, res: Response) => {
  const stream = db.streams.find((s: any) => s.id === req.params.streamId);

  if (!stream) {
    return res.status(404).json({ error: "Stream not found" });
  }

  // Generate mock time-series data for last 5 minutes
  const stats = [];
  const now = Date.now();
  for (let i = 299; i >= 0; i -= 10) {
    stats.push({
      timestamp: new Date(now - i * 1000).toISOString(),
      bitrate: stream.quality.bitrate + (Math.random() - 0.5) * 500,
      fps: stream.quality.fps + (Math.random() - 0.5) * 5,
      droppedFrames: Math.floor(Math.random() * 5),
      latency: stream.health.latency + (Math.random() - 0.5) * 1,
      bufferHealth: Math.min(
        100,
        stream.health.bufferHealth + (Math.random() - 0.5) * 10,
      ),
    });
  }

  res.json({
    streamId: req.params.streamId,
    interval: "10s",
    data: stats,
  });
});

// Get playback URLs for a stream
app.get("/api/streams/:streamId/playback", (req: Request, res: Response) => {
  const stream = db.streams.find((s: any) => s.id === req.params.streamId);

  if (!stream) {
    return res.status(404).json({ error: "Stream not found" });
  }

  const { format = "all" } = req.query;

  if (format === "all") {
    res.json(stream.playbackUrls);
  } else if (stream.playbackUrls[format as string]) {
    res.json({
      format,
      url: stream.playbackUrls[format as string],
    });
  } else {
    res.status(400).json({ error: "Invalid format requested" });
  }
});

// Test stream connectivity
app.post("/api/streams/test-connection", (req: Request, res: Response) => {
  const { ingestUrl, protocol } = req.body;

  if (!ingestUrl || !protocol) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Simulate connection test with random success/failure
  const isSuccessful = Math.random() > 0.1; // 90% success rate
  const latency = 50 + Math.random() * 150;

  setTimeout(() => {
    res.json({
      success: isSuccessful,
      protocol,
      latency: Math.round(latency),
      message: isSuccessful
        ? "Connection test successful"
        : "Connection test failed - Unable to reach ingest server",
      timestamp: new Date().toISOString(),
    });
  }, latency);
});

const server = app.listen(port, () => {
  console.log(
    `🎥 Streaming API mock server running on http://localhost:${port}`,
  );
  console.log(`   Active streams: ${db.streams.length}`);
});

// Graceful shutdown handler
const shutdown = () => {
  console.log("\n🎥 Streaming API shutting down gracefully...");
  server.close(() => {
    console.log("🎥 Streaming API shutdown complete");
    process.exit(0);
  });

  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    console.log("🎥 Streaming API forced shutdown");
    process.exit(0);
  }, 3000);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
