import express, { Request, Response } from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3003;

app.use(cors());
app.use(express.json());

// Load mock database
const dbPath = path.join(__dirname, "../media-database/db.json");
let db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));

// Helper function to save database
const saveDb = () => {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
};

// Health check
app.get("/health", (req: Request, res: Response) => {
  res.json({ ok: true, service: "broadcast-api" });
});

// Get all broadcasts
app.get("/api/broadcasts", (req: Request, res: Response) => {
  const { status, channelId, limit = 50, offset = 0 } = req.query;

  let broadcasts = [...db.broadcasts];

  // Filter by status
  if (status) {
    broadcasts = broadcasts.filter((b: any) => b.status === status);
  }

  // Filter by channel
  if (channelId) {
    broadcasts = broadcasts.filter((b: any) => b.channelId === channelId);
  }

  // Pagination
  const total = broadcasts.length;
  const paginatedBroadcasts = broadcasts.slice(
    Number(offset),
    Number(offset) + Number(limit),
  );

  res.json({
    broadcasts: paginatedBroadcasts,
    total,
    limit: Number(limit),
    offset: Number(offset),
  });
});

// Get broadcast by ID
app.get("/api/broadcasts/:broadcastId", (req: Request, res: Response) => {
  const broadcast = db.broadcasts.find(
    (b: any) => b.id === req.params.broadcastId,
  );

  if (!broadcast) {
    return res.status(404).json({ error: "Broadcast not found" });
  }

  const channel = db.channels.find((c: any) => c.id === broadcast.channelId);
  const stream = db.streams.find((s: any) => s.broadcastId === broadcast.id);
  const analytics = db.analytics.filter(
    (a: any) => a.broadcastId === broadcast.id,
  );

  res.json({
    broadcast,
    channel,
    stream,
    analytics: analytics[analytics.length - 1] || null, // Latest analytics
  });
});

// Create a new broadcast
app.post("/api/broadcasts", (req: Request, res: Response) => {
  const {
    channelId,
    title,
    description,
    scheduledEndAt,
    tags = [],
    language = "en",
    region = "US",
  } = req.body;

  if (!channelId || !title) {
    return res.status(400).json({ error: "channelId and title are required" });
  }

  const channel = db.channels.find((c: any) => c.id === channelId);
  if (!channel) {
    return res.status(404).json({ error: "Channel not found" });
  }

  const newBroadcast = {
    id: `br_${Date.now()}`,
    channelId,
    title,
    description: description || "",
    status: "scheduled",
    startedAt: null,
    scheduledEndAt: scheduledEndAt || null,
    actualEndAt: null,
    currentViewers: 0,
    peakViewers: 0,
    totalViews: 0,
    duration: 0,
    thumbnailUrl: `https://cdn.example.com/broadcasts/br_${Date.now()}_thumb.jpg`,
    tags,
    language,
    region,
  };

  db.broadcasts.push(newBroadcast);
  saveDb();

  res.status(201).json({
    message: "Broadcast created successfully",
    broadcast: newBroadcast,
  });
});

// Start a broadcast
app.post(
  "/api/broadcasts/:broadcastId/start",
  (req: Request, res: Response) => {
    const broadcastIndex = db.broadcasts.findIndex(
      (b: any) => b.id === req.params.broadcastId,
    );

    if (broadcastIndex === -1) {
      return res.status(404).json({ error: "Broadcast not found" });
    }

    const broadcast = db.broadcasts[broadcastIndex];

    if (broadcast.status === "live") {
      return res.status(400).json({ error: "Broadcast is already live" });
    }

    const now = new Date().toISOString();
    db.broadcasts[broadcastIndex].status = "live";
    db.broadcasts[broadcastIndex].startedAt = now;

    // Update channel status
    const channelIndex = db.channels.findIndex(
      (c: any) => c.id === broadcast.channelId,
    );
    if (channelIndex !== -1) {
      db.channels[channelIndex].status = "active";
      db.channels[channelIndex].updatedAt = now;
    }

    saveDb();

    res.json({
      message: "Broadcast started successfully",
      broadcast: db.broadcasts[broadcastIndex],
    });
  },
);

// Stop a broadcast
app.post("/api/broadcasts/:broadcastId/stop", (req: Request, res: Response) => {
  const broadcastIndex = db.broadcasts.findIndex(
    (b: any) => b.id === req.params.broadcastId,
  );

  if (broadcastIndex === -1) {
    return res.status(404).json({ error: "Broadcast not found" });
  }

  const broadcast = db.broadcasts[broadcastIndex];

  if (broadcast.status !== "live") {
    return res.status(400).json({ error: "Broadcast is not live" });
  }

  const now = new Date().toISOString();
  const startTime = new Date(broadcast.startedAt).getTime();
  const endTime = new Date(now).getTime();
  const duration = Math.floor((endTime - startTime) / 1000);

  db.broadcasts[broadcastIndex].status = "completed";
  db.broadcasts[broadcastIndex].actualEndAt = now;
  db.broadcasts[broadcastIndex].duration = duration;

  // Update channel status if no other live broadcasts
  const channelId = broadcast.channelId;
  const hasOtherLiveBroadcasts = db.broadcasts.some(
    (b: any) =>
      b.channelId === channelId && b.id !== broadcast.id && b.status === "live",
  );

  if (!hasOtherLiveBroadcasts) {
    const channelIndex = db.channels.findIndex((c: any) => c.id === channelId);
    if (channelIndex !== -1) {
      db.channels[channelIndex].status = "offline";
      db.channels[channelIndex].viewerCount = 0;
      db.channels[channelIndex].updatedAt = now;
    }
  }

  saveDb();

  res.json({
    message: "Broadcast stopped successfully",
    broadcast: db.broadcasts[broadcastIndex],
    duration,
  });
});

// Update broadcast metadata
app.patch("/api/broadcasts/:broadcastId", (req: Request, res: Response) => {
  const broadcastIndex = db.broadcasts.findIndex(
    (b: any) => b.id === req.params.broadcastId,
  );

  if (broadcastIndex === -1) {
    return res.status(404).json({ error: "Broadcast not found" });
  }

  const { title, description, tags, thumbnailUrl } = req.body;

  if (title) db.broadcasts[broadcastIndex].title = title;
  if (description) db.broadcasts[broadcastIndex].description = description;
  if (tags) db.broadcasts[broadcastIndex].tags = tags;
  if (thumbnailUrl) db.broadcasts[broadcastIndex].thumbnailUrl = thumbnailUrl;

  saveDb();

  res.json({
    message: "Broadcast updated successfully",
    broadcast: db.broadcasts[broadcastIndex],
  });
});

// Delete a broadcast
app.delete("/api/broadcasts/:broadcastId", (req: Request, res: Response) => {
  const broadcastIndex = db.broadcasts.findIndex(
    (b: any) => b.id === req.params.broadcastId,
  );

  if (broadcastIndex === -1) {
    return res.status(404).json({ error: "Broadcast not found" });
  }

  const broadcast = db.broadcasts[broadcastIndex];

  if (broadcast.status === "live") {
    return res
      .status(400)
      .json({ error: "Cannot delete a live broadcast. Stop it first." });
  }

  db.broadcasts.splice(broadcastIndex, 1);
  saveDb();

  res.json({
    message: "Broadcast deleted successfully",
    broadcastId: req.params.broadcastId,
  });
});

// Get broadcast viewers (real-time simulation)
app.get(
  "/api/broadcasts/:broadcastId/viewers",
  (req: Request, res: Response) => {
    const broadcast = db.broadcasts.find(
      (b: any) => b.id === req.params.broadcastId,
    );

    if (!broadcast) {
      return res.status(404).json({ error: "Broadcast not found" });
    }

    if (broadcast.status !== "live") {
      return res.json({
        currentViewers: 0,
        peakViewers: broadcast.peakViewers,
        totalViews: broadcast.totalViews,
      });
    }

    // Simulate viewer count fluctuation
    const baseViewers = broadcast.currentViewers || 1000;
    const fluctuation = Math.floor((Math.random() - 0.5) * 200);
    const currentViewers = Math.max(0, baseViewers + fluctuation);
    const peakViewers = Math.max(broadcast.peakViewers, currentViewers);

    res.json({
      currentViewers,
      peakViewers,
      totalViews: broadcast.totalViews,
      trend: fluctuation > 0 ? "increasing" : "decreasing",
      timestamp: new Date().toISOString(),
    });
  },
);

// Get scheduled broadcasts
app.get("/api/broadcasts/scheduled/upcoming", (req: Request, res: Response) => {
  const { channelId, limit = 10 } = req.query;

  let scheduled = [...db.scheduledBroadcasts];

  if (channelId) {
    scheduled = scheduled.filter((s: any) => s.channelId === channelId);
  }

  // Sort by scheduled start time
  scheduled.sort(
    (a: any, b: any) =>
      new Date(a.scheduledStart).getTime() -
      new Date(b.scheduledStart).getTime(),
  );

  res.json({
    scheduled: scheduled.slice(0, Number(limit)),
    total: scheduled.length,
  });
});

// Schedule a broadcast
app.post("/api/broadcasts/schedule", (req: Request, res: Response) => {
  const {
    channelId,
    title,
    description,
    scheduledStart,
    estimatedDuration,
    tags = [],
  } = req.body;

  if (!channelId || !title || !scheduledStart) {
    return res.status(400).json({
      error: "channelId, title, and scheduledStart are required",
    });
  }

  const channel = db.channels.find((c: any) => c.id === channelId);
  if (!channel) {
    return res.status(404).json({ error: "Channel not found" });
  }

  const newScheduled = {
    id: `sch_${Date.now()}`,
    channelId,
    title,
    description: description || "",
    scheduledStart,
    estimatedDuration: estimatedDuration || 3600,
    status: "scheduled",
    thumbnailUrl: `https://cdn.example.com/scheduled/sch_${Date.now()}_thumb.jpg`,
    tags,
    notificationsSent: 0,
    expectedViewers: Math.floor(Math.random() * 10000) + 5000,
  };

  db.scheduledBroadcasts.push(newScheduled);
  saveDb();

  res.status(201).json({
    message: "Broadcast scheduled successfully",
    scheduled: newScheduled,
  });
});

// Cancel scheduled broadcast
app.delete(
  "/api/broadcasts/scheduled/:scheduledId",
  (req: Request, res: Response) => {
    const scheduledIndex = db.scheduledBroadcasts.findIndex(
      (s: any) => s.id === req.params.scheduledId,
    );

    if (scheduledIndex === -1) {
      return res.status(404).json({ error: "Scheduled broadcast not found" });
    }

    db.scheduledBroadcasts.splice(scheduledIndex, 1);
    saveDb();

    res.json({
      message: "Scheduled broadcast cancelled",
      scheduledId: req.params.scheduledId,
    });
  },
);

// Get broadcast alerts
app.get(
  "/api/broadcasts/:broadcastId/alerts",
  (req: Request, res: Response) => {
    const broadcast = db.broadcasts.find(
      (b: any) => b.id === req.params.broadcastId,
    );

    if (!broadcast) {
      return res.status(404).json({ error: "Broadcast not found" });
    }

    const alerts = db.alerts.filter(
      (a: any) => a.broadcastId === req.params.broadcastId,
    );

    res.json({
      alerts,
      total: alerts.length,
      unresolved: alerts.filter((a: any) => !a.resolved).length,
    });
  },
);

const server = app.listen(port, () => {
  console.log(
    `📡 Broadcast API mock server running on http://localhost:${port}`,
  );
  console.log(`   Total broadcasts: ${db.broadcasts.length}`);
  console.log(
    `   Live broadcasts: ${db.broadcasts.filter((b: any) => b.status === "live").length}`,
  );
  console.log(`   Scheduled: ${db.scheduledBroadcasts.length}`);
});

// Graceful shutdown handler
const shutdown = () => {
  console.log("\n📡 Broadcast API shutting down gracefully...");
  server.close(() => {
    console.log("📡 Broadcast API shutdown complete");
    process.exit(0);
  });

  // Force exit after 5 seconds if graceful shutdown fails
  setTimeout(() => {
    console.log("📡 Broadcast API forced shutdown");
    process.exit(0);
  }, 5000);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
