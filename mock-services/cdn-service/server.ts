import express, { Request, Response } from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3004;

app.use(cors());
app.use(express.json());

// Load mock database for reference
const dbPath = path.join(__dirname, "../media-database/db.json");
let db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));

// Generate a simple SVG placeholder image
function generatePlaceholderSvg(
  width: number,
  height: number,
  text: string,
  bgColor: string = "#6366f1",
  textColor: string = "#ffffff",
): string {
  const escapedText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${bgColor};stop-opacity:1" />
      <stop offset="100%" style="stop-color:#4f46e5;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#grad)"/>
  <text x="50%" y="45%" font-family="Arial, sans-serif" font-size="${Math.min(width, height) / 10}px" fill="${textColor}" text-anchor="middle" dominant-baseline="middle">${escapedText}</text>
  <text x="50%" y="58%" font-family="Arial, sans-serif" font-size="${Math.min(width, height) / 16}px" fill="${textColor}99" text-anchor="middle" dominant-baseline="middle">${width}x${height}</text>
  <rect x="10" y="10" width="60" height="25" rx="5" fill="#ef4444"/>
  <text x="40" y="22" font-family="Arial, sans-serif" font-size="12px" fill="white" text-anchor="middle" dominant-baseline="middle">LIVE</text>
</svg>`;
}

// Generate a VOD thumbnail (no LIVE badge)
function generateVodThumbnailSvg(
  width: number,
  height: number,
  text: string,
  duration: string,
  bgColor: string = "#8b5cf6",
): string {
  const escapedText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${bgColor};stop-opacity:1" />
      <stop offset="100%" style="stop-color:#7c3aed;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#grad)"/>
  <text x="50%" y="45%" font-family="Arial, sans-serif" font-size="${Math.min(width, height) / 10}px" fill="white" text-anchor="middle" dominant-baseline="middle">${escapedText}</text>
  <text x="50%" y="58%" font-family="Arial, sans-serif" font-size="${Math.min(width, height) / 16}px" fill="#ffffff99" text-anchor="middle" dominant-baseline="middle">${width}x${height}</text>
  <!-- Play button -->
  <circle cx="50%" cy="50%" r="${Math.min(width, height) / 8}" fill="#00000066"/>
  <polygon points="${width / 2 - 10},${height / 2 - 15} ${width / 2 - 10},${height / 2 + 15} ${width / 2 + 15},${height / 2}" fill="white"/>
  <!-- Duration badge -->
  <rect x="${width - 70}" y="${height - 35}" width="60" height="25" rx="5" fill="#000000cc"/>
  <text x="${width - 40}" y="${height - 18}" font-family="Arial, sans-serif" font-size="12px" fill="white" text-anchor="middle" dominant-baseline="middle">${duration}</text>
</svg>`;
}

// Format duration from seconds to MM:SS or HH:MM:SS
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

// Generate HLS master playlist
function generateMasterPlaylist(resolutions: string[]): string {
  const variants = resolutions.map((res) => {
    const [width, height] = res.split("x").map(Number);
    const bandwidth = width * height * 3; // Approximate bitrate

    return `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${res},CODECS="avc1.64001f,mp4a.40.2"
${res}/playlist.m3u8`;
  });

  return `#EXTM3U
#EXT-X-VERSION:3
${variants.join("\n")}`;
}

// Generate HLS media playlist
function generateMediaPlaylist(
  duration: number,
  segmentDuration: number = 6,
): string {
  const segmentCount = Math.ceil(duration / segmentDuration);
  const segments = [];

  for (let i = 0; i < segmentCount; i++) {
    const segDuration =
      i === segmentCount - 1 ? duration - i * segmentDuration : segmentDuration;
    segments.push(`#EXTINF:${segDuration.toFixed(3)},
segment${i}.ts`);
  }

  return `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:${segmentDuration}
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
${segments.join("\n")}
#EXT-X-ENDLIST`;
}

// Generate live HLS playlist (no ENDLIST)
function generateLivePlaylist(segmentDuration: number = 6): string {
  const now = Date.now();
  const segments = [];

  // Generate last 5 segments
  for (let i = 0; i < 5; i++) {
    segments.push(`#EXTINF:${segmentDuration.toFixed(3)},
segment${Math.floor(now / 1000) - (4 - i) * segmentDuration}.ts`);
  }

  return `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:${segmentDuration}
#EXT-X-MEDIA-SEQUENCE:${Math.floor(now / 1000 / segmentDuration) - 5}
${segments.join("\n")}`;
}

// Health check
app.get("/health", (req: Request, res: Response) => {
  res.json({ ok: true, service: "cdn-mock" });
});

// Serve channel thumbnails
app.get("/thumbnails/:channelName.jpg", (req: Request, res: Response) => {
  const channelName = String(req.params.channelName);
  const width = Number(req.query.w) || 640;
  const height = Number(req.query.h) || 360;

  // Find channel info
  const channel = db.channels.find(
    (c: any) =>
      c.thumbnailUrl.includes(channelName) ||
      c.name.toLowerCase().replace(/\s+/g, "") === channelName.toLowerCase(),
  );

  const displayName = channel?.name || channelName;
  const bgColor = channel?.status === "active" ? "#059669" : "#6b7280";

  const svg = generatePlaceholderSvg(width, height, displayName, bgColor);

  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(svg);
});

// Serve broadcast thumbnails
app.get("/broadcasts/:broadcastId_thumb.jpg", (req: Request, res: Response) => {
  const broadcastId = String(req.params.broadcastId_thumb).replace(
    "_thumb",
    "",
  );
  const width = Number(req.query.w) || 640;
  const height = Number(req.query.h) || 360;

  // Find broadcast info
  const broadcast = db.broadcasts.find((b: any) => b.id === broadcastId);

  const displayName = broadcast?.title || `Broadcast ${broadcastId}`;
  const isLive = broadcast?.status === "live";

  let svg: string;
  if (isLive) {
    svg = generatePlaceholderSvg(width, height, displayName, "#dc2626");
  } else {
    const duration = formatDuration(broadcast?.duration || 0);
    svg = generateVodThumbnailSvg(width, height, displayName, duration);
  }

  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=60");
  res.send(svg);
});

// Serve scheduled broadcast thumbnails
app.get("/scheduled/:scheduledId_thumb.jpg", (req: Request, res: Response) => {
  const scheduledId = String(req.params.scheduledId_thumb).replace(
    "_thumb",
    "",
  );
  const width = Number(req.query.w) || 640;
  const height = Number(req.query.h) || 360;

  const scheduled = db.scheduledBroadcasts.find(
    (s: any) => s.id === scheduledId,
  );
  const displayName = scheduled?.title || `Scheduled ${scheduledId}`;
  const scheduledTime = scheduled?.scheduledStart
    ? new Date(scheduled.scheduledStart).toLocaleString()
    : "TBD";

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#f59e0b;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#d97706;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#grad)"/>
  <text x="50%" y="40%" font-family="Arial, sans-serif" font-size="${Math.min(width, height) / 12}px" fill="white" text-anchor="middle" dominant-baseline="middle">${displayName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>
  <text x="50%" y="55%" font-family="Arial, sans-serif" font-size="${Math.min(width, height) / 18}px" fill="#ffffff99" text-anchor="middle" dominant-baseline="middle">Scheduled</text>
  <rect x="10" y="10" width="80" height="25" rx="5" fill="#7c3aed"/>
  <text x="50" y="22" font-family="Arial, sans-serif" font-size="11px" fill="white" text-anchor="middle" dominant-baseline="middle">UPCOMING</text>
</svg>`;

  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(svg);
});

// Serve VOD thumbnails
app.get("/vod/:recordingId_thumb.jpg", (req: Request, res: Response) => {
  const recordingId = String(req.params.recordingId_thumb).replace(
    "_thumb",
    "",
  );
  const width = Number(req.query.w) || 640;
  const height = Number(req.query.h) || 360;

  const recording = db.recordings.find(
    (r: any) => r.id === recordingId || r.broadcastId === recordingId,
  );
  const displayName = recording?.title || `Recording ${recordingId}`;
  const duration = formatDuration(recording?.duration || 0);

  const svg = generateVodThumbnailSvg(
    width,
    height,
    displayName,
    duration,
    "#6366f1",
  );

  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(svg);
});

// Serve live HLS master playlist
app.get("/live/:channelName/playlist.m3u8", (req: Request, res: Response) => {
  const playlist = generateMasterPlaylist([
    "1920x1080",
    "1280x720",
    "854x480",
    "640x360",
  ]);

  res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
  res.setHeader("Cache-Control", "no-cache");
  res.send(playlist);
});

// Serve live HLS media playlist by resolution
app.get(
  "/live/:channelName/:resolution/playlist.m3u8",
  (req: Request, res: Response) => {
    const playlist = generateLivePlaylist(6);

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-cache, no-store");
    res.send(playlist);
  },
);

// Serve VOD HLS master playlist
app.get("/vod/:recordingId/master.m3u8", (req: Request, res: Response) => {
  const playlist = generateMasterPlaylist(["1920x1080", "1280x720", "854x480"]);

  res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(playlist);
});

// Serve VOD HLS media playlist by resolution
app.get(
  "/vod/:recordingId/:resolution/playlist.m3u8",
  (req: Request, res: Response) => {
    const { recordingId } = req.params;

    const recording = db.recordings.find(
      (r: any) => r.id === recordingId || r.broadcastId === recordingId,
    );
    const duration = recording?.duration || 3600;

    const playlist = generateMediaPlaylist(duration, 6);

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(playlist);
  },
);

// Serve mock video segments (returns a tiny valid TS segment header)
app.get(
  [
    "/live/:channelName/:resolution/:segment.ts",
    "/vod/:recordingId/:resolution/:segment.ts",
  ],
  (req: Request, res: Response) => {
    // Return a minimal TS packet (188 bytes with sync byte)
    // This is a mock - real segments would be actual video data
    const mockSegment = Buffer.alloc(188 * 10);

    // Fill with valid TS sync bytes
    for (let i = 0; i < 10; i++) {
      mockSegment[i * 188] = 0x47; // TS sync byte
      mockSegment[i * 188 + 1] = 0x00;
      mockSegment[i * 188 + 2] = 0x00;
      mockSegment[i * 188 + 3] = 0x10;
    }

    res.setHeader("Content-Type", "video/mp2t");
    res.setHeader("Content-Length", mockSegment.length.toString());
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(mockSegment);
  },
);

// Serve preview clips - using regex route for Express 5 compatibility
app.get(/^\/vod\/(.+)_preview_(\d+)\.mp4$/, (req: Request, res: Response) => {
  // req.params will be an array-like object with indices 0, 1 for capture groups
  const recordingId = req.params[0];
  const clipNum = req.params[1];

  // Return mock MP4 header
  const mockMp4 = Buffer.from([
    0x00,
    0x00,
    0x00,
    0x1c,
    0x66,
    0x74,
    0x79,
    0x70, // ftyp box
    0x69,
    0x73,
    0x6f,
    0x6d,
    0x00,
    0x00,
    0x02,
    0x00,
    0x69,
    0x73,
    0x6f,
    0x6d,
    0x69,
    0x73,
    0x6f,
    0x32,
    0x6d,
    0x70,
    0x34,
    0x31,
  ]);

  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Content-Length", mockMp4.length.toString());
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(mockMp4);
});

// Serve downloadable content
app.get("/downloads/:broadcastId.mp4", (req: Request, res: Response) => {
  const { broadcastId } = req.params;

  const recording = db.recordings.find(
    (r: any) => r.broadcastId === broadcastId,
  );

  if (!recording) {
    return res.status(404).json({ error: "Recording not found" });
  }

  // For a real implementation, this would stream the actual file
  // Here we just return metadata about the download
  res.json({
    message: "Mock download endpoint",
    recording: {
      id: recording.id,
      title: recording.title,
      fileSize: recording.fileSize,
      format: recording.format,
      duration: recording.duration,
    },
    note: "In a real implementation, this would return the actual video file",
  });
});

// DASH manifest endpoint
app.get("/live/:channelName/manifest.mpd", (req: Request, res: Response) => {
  const { channelName } = req.params;

  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="dynamic" minimumUpdatePeriod="PT2S" availabilityStartTime="${new Date().toISOString()}" publishTime="${new Date().toISOString()}" minBufferTime="PT2S">
  <Period id="1" start="PT0S">
    <AdaptationSet mimeType="video/mp4" segmentAlignment="true">
      <Representation id="1080p" bandwidth="6000000" width="1920" height="1080" codecs="avc1.64001f">
        <SegmentTemplate media="segment_$Number$.m4s" initialization="init.mp4" timescale="90000" duration="540000" startNumber="1"/>
      </Representation>
      <Representation id="720p" bandwidth="3000000" width="1280" height="720" codecs="avc1.64001f">
        <SegmentTemplate media="segment_$Number$.m4s" initialization="init.mp4" timescale="90000" duration="540000" startNumber="1"/>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

  res.setHeader("Content-Type", "application/dash+xml");
  res.setHeader("Cache-Control", "no-cache");
  res.send(manifest);
});

// Generic image endpoint for any path - Express 5 requires named wildcards
app.get("/{*path}", (req: Request, res: Response) => {
  const path = req.path;

  // Check if it's an image request
  if (
    path.endsWith(".jpg") ||
    path.endsWith(".png") ||
    path.endsWith(".jpeg")
  ) {
    const width = Number(req.query.w) || 640;
    const height = Number(req.query.h) || 360;

    // Extract a name from the path
    const name =
      path
        .split("/")
        .pop()
        ?.replace(/\.(jpg|png|jpeg)$/, "")
        ?.replace(/_thumb$/, "")
        ?.replace(/_/g, " ") || "Media";

    const svg = generatePlaceholderSvg(width, height, name, "#4f46e5");

    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.send(svg);
  }

  // Check if it's a playlist request
  if (path.endsWith(".m3u8")) {
    const playlist = generateMasterPlaylist(["1920x1080", "1280x720"]);
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-cache");
    return res.send(playlist);
  }

  res.status(404).json({
    error: "Not found",
    path: req.path,
    hint: "Try /thumbnails/channel.jpg, /broadcasts/br_001_thumb.jpg, or /live/channel/playlist.m3u8",
  });
});

const server = app.listen(port, () => {
  console.log(`📺 CDN Mock server running on http://localhost:${port}`);
  console.log(`   Serving thumbnails for ${db.channels.length} channels`);
  console.log(`   Serving thumbnails for ${db.broadcasts.length} broadcasts`);
  console.log(`   Serving VOD for ${db.recordings.length} recordings`);
  console.log(`\n   Example endpoints:`);
  console.log(`   - http://localhost:${port}/thumbnails/techTV.jpg`);
  console.log(`   - http://localhost:${port}/broadcasts/br_001_thumb.jpg`);
  console.log(`   - http://localhost:${port}/live/techTV/playlist.m3u8`);
  console.log(`   - http://localhost:${port}/vod/br_003/master.m3u8`);
});

// Graceful shutdown handler
const shutdown = () => {
  console.log("\n📺 CDN Mock server shutting down gracefully...");
  server.close(() => {
    console.log("📺 CDN Mock server shutdown complete");
    process.exit(0);
  });

  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    console.log("📺 CDN Mock server forced shutdown");
    process.exit(0);
  }, 3000);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
