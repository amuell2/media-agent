import express, { Request, Response } from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3005;

app.use(cors());
app.use(express.json());

// Load mock database
const dbPath = path.join(__dirname, "../media-database/db.json");
let db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));

// Helper function to generate time-series data
const generateTimeSeries = (
  startTime: Date,
  endTime: Date,
  intervalMinutes: number,
  baseValue: number,
  variance: number,
) => {
  const data = [];
  let currentTime = new Date(startTime);

  while (currentTime <= endTime) {
    const value = baseValue + (Math.random() - 0.5) * variance;
    data.push({
      timestamp: currentTime.toISOString(),
      value: Math.max(0, Math.round(value)),
    });
    currentTime = new Date(currentTime.getTime() + intervalMinutes * 60 * 1000);
  }

  return data;
};

// Health check
app.get("/health", (req: Request, res: Response) => {
  res.json({ ok: true, service: "analytics-service" });
});

// Get analytics for a specific broadcast
app.get(
  "/api/analytics/broadcasts/:broadcastId",
  (req: Request, res: Response) => {
    const broadcast = db.broadcasts.find(
      (b: any) => b.id === req.params.broadcastId,
    );

    if (!broadcast) {
      return res.status(404).json({ error: "Broadcast not found" });
    }

    const analytics = db.analytics.filter(
      (a: any) => a.broadcastId === req.params.broadcastId,
    );

    if (analytics.length === 0) {
      return res.status(404).json({ error: "No analytics data available" });
    }

    res.json({
      broadcastId: req.params.broadcastId,
      analytics: analytics[analytics.length - 1], // Latest snapshot
      history: analytics,
    });
  },
);

// Get real-time viewer count for a broadcast
app.get(
  "/api/analytics/broadcasts/:broadcastId/viewers/realtime",
  (req: Request, res: Response) => {
    const broadcast = db.broadcasts.find(
      (b: any) => b.id === req.params.broadcastId,
    );

    if (!broadcast) {
      return res.status(404).json({ error: "Broadcast not found" });
    }

    if (broadcast.status !== "live") {
      return res.json({
        broadcastId: req.params.broadcastId,
        status: broadcast.status,
        currentViewers: 0,
        peakViewers: broadcast.peakViewers,
      });
    }

    // Simulate real-time fluctuation
    const baseViewers = broadcast.currentViewers || 10000;
    const fluctuation = Math.floor((Math.random() - 0.5) * (baseViewers * 0.1));
    const currentViewers = Math.max(0, baseViewers + fluctuation);

    res.json({
      broadcastId: req.params.broadcastId,
      status: "live",
      currentViewers,
      peakViewers: Math.max(broadcast.peakViewers, currentViewers),
      timestamp: new Date().toISOString(),
      trend: fluctuation > 0 ? "up" : fluctuation < 0 ? "down" : "stable",
      changePercent: ((fluctuation / baseViewers) * 100).toFixed(2),
    });
  },
);

// Get viewer engagement metrics
app.get(
  "/api/analytics/broadcasts/:broadcastId/engagement",
  (req: Request, res: Response) => {
    const analytics = db.analytics.find(
      (a: any) => a.broadcastId === req.params.broadcastId,
    );

    if (!analytics) {
      return res.status(404).json({ error: "Analytics data not found" });
    }

    const engagement = {
      broadcastId: req.params.broadcastId,
      metrics: {
        engagementRate: analytics.metrics.engagementRate,
        averageViewDuration: analytics.metrics.averageViewDuration,
        chatMessages: analytics.metrics.chatMessages,
        likes: analytics.metrics.likes,
        shares: analytics.metrics.shares,
        messagesPerMinute: Math.round(
          analytics.metrics.chatMessages /
            (analytics.metrics.averageViewDuration / 60),
        ),
        likeRate: (
          analytics.metrics.likes / analytics.metrics.currentViewers
        ).toFixed(3),
        shareRate: (
          analytics.metrics.shares / analytics.metrics.currentViewers
        ).toFixed(3),
      },
      timestamp: analytics.timestamp,
    };

    res.json(engagement);
  },
);

// Get demographic breakdown
app.get(
  "/api/analytics/broadcasts/:broadcastId/demographics",
  (req: Request, res: Response) => {
    const analytics = db.analytics.find(
      (a: any) => a.broadcastId === req.params.broadcastId,
    );

    if (!analytics) {
      return res.status(404).json({ error: "Analytics data not found" });
    }

    res.json({
      broadcastId: req.params.broadcastId,
      demographics: analytics.demographics,
      timestamp: analytics.timestamp,
    });
  },
);

// Get quality metrics
app.get(
  "/api/analytics/broadcasts/:broadcastId/quality",
  (req: Request, res: Response) => {
    const analytics = db.analytics.find(
      (a: any) => a.broadcastId === req.params.broadcastId,
    );

    if (!analytics) {
      return res.status(404).json({ error: "Analytics data not found" });
    }

    const qualityScore = (
      (1 - analytics.quality.bufferingRate) * 40 +
      analytics.quality.averageBitrate / 200 +
      (1 / analytics.quality.startupTime) * 20 +
      (1 - analytics.quality.rebufferCount) * 20
    ).toFixed(2);

    res.json({
      broadcastId: req.params.broadcastId,
      quality: {
        ...analytics.quality,
        overallScore: qualityScore,
        rating:
          parseFloat(qualityScore) > 80
            ? "excellent"
            : parseFloat(qualityScore) > 60
              ? "good"
              : parseFloat(qualityScore) > 40
                ? "fair"
                : "poor",
      },
      timestamp: analytics.timestamp,
    });
  },
);

// Get viewer count time-series
app.get(
  "/api/analytics/broadcasts/:broadcastId/viewers/timeseries",
  (req: Request, res: Response) => {
    const { interval = "5", duration = "60" } = req.query;
    const broadcast = db.broadcasts.find(
      (b: any) => b.id === req.params.broadcastId,
    );

    if (!broadcast) {
      return res.status(404).json({ error: "Broadcast not found" });
    }

    const startTime = broadcast.startedAt
      ? new Date(broadcast.startedAt)
      : new Date(Date.now() - Number(duration) * 60 * 1000);
    const endTime = broadcast.actualEndAt
      ? new Date(broadcast.actualEndAt)
      : new Date();

    const data = generateTimeSeries(
      startTime,
      endTime,
      Number(interval),
      broadcast.currentViewers || broadcast.peakViewers || 10000,
      (broadcast.currentViewers || 10000) * 0.2,
    );

    res.json({
      broadcastId: req.params.broadcastId,
      interval: `${interval}m`,
      duration: `${duration}m`,
      dataPoints: data.length,
      data,
    });
  },
);

// Get channel analytics summary
app.get("/api/analytics/channels/:channelId", (req: Request, res: Response) => {
  const channel = db.channels.find((c: any) => c.id === req.params.channelId);

  if (!channel) {
    return res.status(404).json({ error: "Channel not found" });
  }

  const channelBroadcasts = db.broadcasts.filter(
    (b: any) => b.channelId === req.params.channelId,
  );
  const totalViews = channelBroadcasts.reduce(
    (sum: number, b: any) => sum + b.totalViews,
    0,
  );
  const totalDuration = channelBroadcasts.reduce(
    (sum: number, b: any) => sum + (b.duration || 0),
    0,
  );
  const avgViewers =
    channelBroadcasts.length > 0
      ? channelBroadcasts.reduce(
          (sum: number, b: any) => sum + b.peakViewers,
          0,
        ) / channelBroadcasts.length
      : 0;

  res.json({
    channelId: req.params.channelId,
    channelName: channel.name,
    summary: {
      totalBroadcasts: channelBroadcasts.length,
      liveBroadcasts: channelBroadcasts.filter((b: any) => b.status === "live")
        .length,
      completedBroadcasts: channelBroadcasts.filter(
        (b: any) => b.status === "completed",
      ).length,
      totalViews,
      totalWatchTime: totalDuration,
      averagePeakViewers: Math.round(avgViewers),
      currentViewers: channel.viewerCount,
    },
    period: "all-time",
    timestamp: new Date().toISOString(),
  });
});

// Get top performing broadcasts
app.get("/api/analytics/broadcasts/top", (req: Request, res: Response) => {
  const { metric = "peakViewers", limit = 10, channelId } = req.query;

  let broadcasts = [...db.broadcasts];

  if (channelId) {
    broadcasts = broadcasts.filter((b: any) => b.channelId === channelId);
  }

  // Only consider completed or live broadcasts
  broadcasts = broadcasts.filter(
    (b: any) => b.status === "completed" || b.status === "live",
  );

  // Sort by specified metric
  broadcasts.sort((a: any, b: any) => {
    const aValue = a[metric as string] || 0;
    const bValue = b[metric as string] || 0;
    return bValue - aValue;
  });

  const topBroadcasts = broadcasts.slice(0, Number(limit)).map((b: any) => {
    const channel = db.channels.find((c: any) => c.id === b.channelId);
    return {
      id: b.id,
      title: b.title,
      channelName: channel?.name,
      status: b.status,
      [metric as string]: b[metric as string],
      startedAt: b.startedAt,
    };
  });

  res.json({
    metric,
    limit: Number(limit),
    broadcasts: topBroadcasts,
  });
});

// Get geographic distribution
app.get(
  "/api/analytics/broadcasts/:broadcastId/geography",
  (req: Request, res: Response) => {
    const analytics = db.analytics.find(
      (a: any) => a.broadcastId === req.params.broadcastId,
    );

    if (!analytics) {
      return res.status(404).json({ error: "Analytics data not found" });
    }

    const regions = analytics.demographics.regions;
    const total = Object.values(regions).reduce(
      (sum: number, val: any) => sum + val,
      0,
    );

    const geography = Object.entries(regions).map(([region, percentage]) => ({
      region,
      percentage: percentage as number,
      estimatedViewers: Math.round(
        ((percentage as number) / 100) * analytics.metrics.currentViewers,
      ),
    }));

    geography.sort((a, b) => b.percentage - a.percentage);

    res.json({
      broadcastId: req.params.broadcastId,
      geography,
      timestamp: analytics.timestamp,
    });
  },
);

// Get device and platform breakdown
app.get(
  "/api/analytics/broadcasts/:broadcastId/devices",
  (req: Request, res: Response) => {
    const analytics = db.analytics.find(
      (a: any) => a.broadcastId === req.params.broadcastId,
    );

    if (!analytics) {
      return res.status(404).json({ error: "Analytics data not found" });
    }

    res.json({
      broadcastId: req.params.broadcastId,
      devices: analytics.demographics.devices,
      platforms: analytics.demographics.platforms,
      timestamp: analytics.timestamp,
    });
  },
);

// Get watch time distribution
app.get(
  "/api/analytics/broadcasts/:broadcastId/watch-time",
  (req: Request, res: Response) => {
    const broadcast = db.broadcasts.find(
      (b: any) => b.id === req.params.broadcastId,
    );
    const analytics = db.analytics.find(
      (a: any) => a.broadcastId === req.params.broadcastId,
    );

    if (!broadcast || !analytics) {
      return res
        .status(404)
        .json({ error: "Broadcast or analytics not found" });
    }

    // Generate watch time distribution
    const distribution = [
      {
        range: "0-5 min",
        count: Math.round(analytics.metrics.currentViewers * 0.15),
        percentage: 15,
      },
      {
        range: "5-15 min",
        count: Math.round(analytics.metrics.currentViewers * 0.25),
        percentage: 25,
      },
      {
        range: "15-30 min",
        count: Math.round(analytics.metrics.currentViewers * 0.3),
        percentage: 30,
      },
      {
        range: "30-60 min",
        count: Math.round(analytics.metrics.currentViewers * 0.2),
        percentage: 20,
      },
      {
        range: "60+ min",
        count: Math.round(analytics.metrics.currentViewers * 0.1),
        percentage: 10,
      },
    ];

    res.json({
      broadcastId: req.params.broadcastId,
      averageWatchTime: analytics.metrics.averageViewDuration,
      totalWatchTime: analytics.metrics.totalWatchTime,
      distribution,
      timestamp: analytics.timestamp,
    });
  },
);

// Get comparative analytics (current vs previous broadcast)
app.get(
  "/api/analytics/channels/:channelId/compare",
  (req: Request, res: Response) => {
    const channel = db.channels.find((c: any) => c.id === req.params.channelId);

    if (!channel) {
      return res.status(404).json({ error: "Channel not found" });
    }

    const channelBroadcasts = db.broadcasts
      .filter(
        (b: any) =>
          b.channelId === req.params.channelId && b.status === "completed",
      )
      .sort(
        (a: any, b: any) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      );

    if (channelBroadcasts.length < 2) {
      return res
        .status(400)
        .json({ error: "Not enough broadcasts to compare" });
    }

    const current = channelBroadcasts[0];
    const previous = channelBroadcasts[1];

    const comparison = {
      current: {
        id: current.id,
        title: current.title,
        peakViewers: current.peakViewers,
        totalViews: current.totalViews,
        duration: current.duration,
      },
      previous: {
        id: previous.id,
        title: previous.title,
        peakViewers: previous.peakViewers,
        totalViews: previous.totalViews,
        duration: previous.duration,
      },
      changes: {
        peakViewers: current.peakViewers - previous.peakViewers,
        peakViewersPercent: (
          ((current.peakViewers - previous.peakViewers) /
            previous.peakViewers) *
          100
        ).toFixed(2),
        totalViews: current.totalViews - previous.totalViews,
        totalViewsPercent: (
          ((current.totalViews - previous.totalViews) / previous.totalViews) *
          100
        ).toFixed(2),
      },
    };

    res.json(comparison);
  },
);

const server = app.listen(port, () => {
  console.log(
    `📊 Analytics Service mock server running on http://localhost:${port}`,
  );
  console.log(`   Analytics records: ${db.analytics.length}`);
  console.log(
    `   Tracking ${db.broadcasts.length} broadcasts across ${db.channels.length} channels`,
  );
});

// Graceful shutdown handler
const shutdown = () => {
  console.log("\n📊 Analytics Service shutting down gracefully...");
  server.close(() => {
    console.log("📊 Analytics Service stopped");
    process.exit(0);
  });

  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    console.log("📊 Analytics Service force shutdown");
    process.exit(0);
  }, 3000);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
