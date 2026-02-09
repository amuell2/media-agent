# Media Streaming Platform - Data Models Reference

This document describes all the data models used in the media streaming and broadcasting platform.

---

## Channel

A channel represents a streaming entity that can host broadcasts. Channels are the primary organizational unit for content.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (e.g., `ch_001`) |
| `name` | string | Display name of the channel |
| `description` | string | Channel description |
| `type` | string | Channel type, typically `"live"` |
| `status` | string | Current status: `"active"`, `"offline"` |
| `streamKey` | string | Secret key used for stream authentication |
| `rtmpUrl` | string | RTMP ingest URL for the channel |
| `hlsUrl` | string | HLS playback URL |
| `thumbnailUrl` | string | URL to channel thumbnail image |
| `viewerCount` | number | Current number of viewers |
| `resolution` | string | Default resolution (e.g., `"1920x1080"`) |
| `bitrate` | number | Default bitrate in kbps |
| `fps` | number | Default frames per second |
| `createdAt` | ISO 8601 string | Channel creation timestamp |
| `updatedAt` | ISO 8601 string | Last update timestamp |

### Example

```json
{
  "id": "ch_001",
  "name": "TechTV Network",
  "description": "Technology and innovation broadcasting",
  "type": "live",
  "status": "active",
  "streamKey": "live_tech_stream_key_abc123",
  "rtmpUrl": "rtmp://streaming.example.com/live",
  "hlsUrl": "http://localhost:3004/live/techTV/playlist.m3u8",
  "thumbnailUrl": "http://localhost:3004/thumbnails/techTV.jpg",
  "viewerCount": 15234,
  "resolution": "1920x1080",
  "bitrate": 6000,
  "fps": 60,
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-20T14:30:00Z"
}
```

---

## Broadcast

A broadcast represents a specific streaming session on a channel. Broadcasts can be live, scheduled, or completed.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (e.g., `br_001`) |
| `channelId` | string | Reference to the parent channel |
| `title` | string | Broadcast title |
| `description` | string | Broadcast description |
| `status` | string | Status: `"scheduled"`, `"live"`, `"completed"` |
| `startedAt` | ISO 8601 string | When the broadcast started (null if not started) |
| `scheduledEndAt` | ISO 8601 string | Expected end time |
| `actualEndAt` | ISO 8601 string | Actual end time (null if ongoing) |
| `currentViewers` | number | Current viewer count (0 if not live) |
| `peakViewers` | number | Maximum concurrent viewers reached |
| `totalViews` | number | Total unique views |
| `duration` | number | Duration in seconds |
| `thumbnailUrl` | string | URL to broadcast thumbnail |
| `vodUrl` | string | VOD playback URL (only for completed broadcasts) |
| `tags` | string[] | Content tags for categorization |
| `language` | string | Primary language code |
| `region` | string | Target region (e.g., `"US"`, `"GLOBAL"`) |

### Broadcast Status Lifecycle

1. `scheduled` - Broadcast is planned but not yet started
2. `live` - Broadcast is currently streaming
3. `completed` - Broadcast has ended

### Example

```json
{
  "id": "br_001",
  "channelId": "ch_001",
  "title": "CES 2024 Keynote Coverage",
  "description": "Live coverage of the biggest tech announcements",
  "status": "live",
  "startedAt": "2024-01-20T13:00:00Z",
  "scheduledEndAt": "2024-01-20T16:00:00Z",
  "actualEndAt": null,
  "currentViewers": 15234,
  "peakViewers": 23451,
  "totalViews": 45678,
  "duration": 5400,
  "thumbnailUrl": "http://localhost:3004/broadcasts/br_001_thumb.jpg",
  "tags": ["tech", "ces", "innovation", "keynote"],
  "language": "en",
  "region": "US"
}
```

---

## Stream

A stream represents the technical streaming connection for an active broadcast.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (e.g., `st_001`) |
| `broadcastId` | string | Reference to the associated broadcast |
| `channelId` | string | Reference to the parent channel |
| `protocol` | string | Streaming protocol: `"RTMP"`, `"SRT"`, `"WebRTC"` |
| `ingestUrl` | string | URL where the stream is ingested |
| `playbackUrls` | object | Object containing playback URLs by format |
| `quality` | object | Stream quality settings |
| `health` | object | Real-time health metrics |
| `startedAt` | ISO 8601 string | When the stream started |

### Playback URLs Object

| Field | Type | Description |
|-------|------|-------------|
| `hls` | string | HLS playlist URL (.m3u8) |
| `dash` | string | DASH manifest URL (.mpd) |
| `rtmp` | string | RTMP playback URL (optional) |

### Quality Object

| Field | Type | Description |
|-------|------|-------------|
| `resolution` | string | Video resolution (e.g., `"1920x1080"`) |
| `bitrate` | number | Bitrate in kbps |
| `fps` | number | Frames per second |
| `codec` | string | Video codec (e.g., `"H.264"`, `"H.265"`) |

### Health Object

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Health status: `"healthy"`, `"degraded"`, `"critical"` |
| `latency` | number | End-to-end latency in seconds |
| `bufferHealth` | number | Buffer health percentage (0-100) |
| `droppedFrames` | number | Total dropped frames |
| `networkJitter` | number | Network jitter in seconds |

### Example

```json
{
  "id": "st_001",
  "broadcastId": "br_001",
  "channelId": "ch_001",
  "protocol": "RTMP",
  "ingestUrl": "rtmp://ingest.example.com/live/tech_stream_key_abc123",
  "playbackUrls": {
    "hls": "http://localhost:3004/live/techTV/playlist.m3u8",
    "dash": "http://localhost:3004/live/techTV/manifest.mpd",
    "rtmp": "rtmp://streaming.example.com/live/techTV"
  },
  "quality": {
    "resolution": "1920x1080",
    "bitrate": 6000,
    "fps": 60,
    "codec": "H.264"
  },
  "health": {
    "status": "healthy",
    "latency": 2.3,
    "bufferHealth": 95,
    "droppedFrames": 12,
    "networkJitter": 1.2
  },
  "startedAt": "2024-01-20T13:00:00Z"
}
```

---

## Analytics

Analytics data provides insights into broadcast performance and viewer behavior.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (e.g., `an_001`) |
| `broadcastId` | string | Reference to the associated broadcast |
| `timestamp` | ISO 8601 string | When this analytics snapshot was taken |
| `metrics` | object | Engagement and performance metrics |
| `demographics` | object | Viewer demographic breakdown |
| `quality` | object | Stream quality metrics |

### Metrics Object

| Field | Type | Description |
|-------|------|-------------|
| `currentViewers` | number | Current concurrent viewers |
| `peakViewers` | number | Peak concurrent viewers |
| `averageViewDuration` | number | Average view duration in seconds |
| `totalWatchTime` | number | Total watch time in seconds |
| `engagementRate` | number | Engagement rate (0-1) |
| `chatMessages` | number | Total chat messages |
| `likes` | number | Total likes |
| `shares` | number | Total shares |

### Demographics Object

| Field | Type | Description |
|-------|------|-------------|
| `regions` | object | Percentage breakdown by region |
| `devices` | object | Percentage breakdown by device type |
| `platforms` | object | Percentage breakdown by platform |

### Quality Object

| Field | Type | Description |
|-------|------|-------------|
| `averageBitrate` | number | Average delivered bitrate in kbps |
| `bufferingRate` | number | Buffering rate (0-1) |
| `startupTime` | number | Average startup time in seconds |
| `rebufferCount` | number | Average rebuffer count per viewer |

### Example

```json
{
  "id": "an_001",
  "broadcastId": "br_001",
  "timestamp": "2024-01-20T14:30:00Z",
  "metrics": {
    "currentViewers": 15234,
    "peakViewers": 23451,
    "averageViewDuration": 1847,
    "totalWatchTime": 28156920,
    "engagementRate": 0.78,
    "chatMessages": 4523,
    "likes": 892,
    "shares": 234
  },
  "demographics": {
    "regions": {
      "US": 45,
      "EU": 30,
      "ASIA": 18,
      "OTHER": 7
    },
    "devices": {
      "mobile": 52,
      "desktop": 35,
      "tv": 10,
      "tablet": 3
    },
    "platforms": {
      "web": 48,
      "ios": 28,
      "android": 20,
      "smartTV": 4
    }
  },
  "quality": {
    "averageBitrate": 5800,
    "bufferingRate": 0.02,
    "startupTime": 1.2,
    "rebufferCount": 0.3
  }
}
```

---

## Recording

A recording represents a VOD (Video on Demand) version of a completed broadcast.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (e.g., `rec_001`) |
| `broadcastId` | string | Reference to the source broadcast |
| `channelId` | string | Reference to the parent channel |
| `title` | string | Recording title |
| `status` | string | Status: `"processing"`, `"completed"`, `"failed"` |
| `duration` | number | Duration in seconds |
| `fileSize` | number | File size in bytes |
| `format` | string | Video format (e.g., `"mp4"`) |
| `resolution` | string | Video resolution |
| `vodUrl` | string | HLS playback URL for VOD |
| `downloadUrl` | string | Direct download URL |
| `thumbnailUrl` | string | Thumbnail image URL |
| `previewClips` | string[] | Array of preview clip URLs |
| `chapters` | object[] | Chapter markers with timestamps |
| `createdAt` | ISO 8601 string | When the recording was created |
| `views` | number | Total VOD views |

### Chapter Object

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Chapter title |
| `startTime` | number | Start time in seconds |
| `endTime` | number | End time in seconds |

### Example

```json
{
  "id": "rec_001",
  "broadcastId": "br_003",
  "channelId": "ch_001",
  "title": "AI Workshop: Building with LLMs",
  "status": "completed",
  "duration": 8100,
  "fileSize": 4523456789,
  "format": "mp4",
  "resolution": "1920x1080",
  "vodUrl": "http://localhost:3004/vod/br_003/master.m3u8",
  "downloadUrl": "http://localhost:3004/downloads/br_003.mp4",
  "thumbnailUrl": "http://localhost:3004/vod/br_003_thumb.jpg",
  "previewClips": [
    "http://localhost:3004/vod/br_003_preview_1.mp4",
    "http://localhost:3004/vod/br_003_preview_2.mp4"
  ],
  "chapters": [
    { "title": "Introduction to LLMs", "startTime": 0, "endTime": 900 },
    { "title": "Setting up your environment", "startTime": 900, "endTime": 2700 },
    { "title": "Building your first agent", "startTime": 2700, "endTime": 5400 },
    { "title": "Q&A Session", "startTime": 5400, "endTime": 8100 }
  ],
  "createdAt": "2024-01-19T12:20:00Z",
  "views": 3452
}
```

---

## Scheduled Broadcast

A scheduled broadcast represents a planned future broadcast.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (e.g., `sch_001`) |
| `channelId` | string | Reference to the parent channel |
| `title` | string | Broadcast title |
| `description` | string | Broadcast description |
| `scheduledStart` | ISO 8601 string | Planned start time |
| `estimatedDuration` | number | Expected duration in seconds |
| `status` | string | Status: `"scheduled"`, `"cancelled"` |
| `thumbnailUrl` | string | Thumbnail image URL |
| `tags` | string[] | Content tags |
| `notificationsSent` | number | Number of notifications sent to subscribers |
| `expectedViewers` | number | Predicted viewer count |

### Example

```json
{
  "id": "sch_001",
  "channelId": "ch_001",
  "title": "Weekly Tech Roundup",
  "description": "Review of the week's biggest tech news",
  "scheduledStart": "2024-01-21T18:00:00Z",
  "estimatedDuration": 3600,
  "status": "scheduled",
  "thumbnailUrl": "http://localhost:3004/scheduled/sch_001_thumb.jpg",
  "tags": ["tech", "news", "weekly"],
  "notificationsSent": 8934,
  "expectedViewers": 12000
}
```

---

## Alert

Alerts represent system notifications about broadcast issues or events.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (e.g., `alert_001`) |
| `channelId` | string | Reference to the channel |
| `broadcastId` | string | Reference to the broadcast |
| `type` | string | Alert type (see below) |
| `severity` | string | Severity: `"info"`, `"warning"`, `"error"`, `"critical"` |
| `message` | string | Human-readable alert message |
| `details` | object | Additional context-specific details |
| `timestamp` | ISO 8601 string | When the alert was triggered |
| `resolved` | boolean | Whether the alert has been resolved |
| `resolvedAt` | ISO 8601 string | When the alert was resolved (if applicable) |

### Alert Types

- `performance` - Stream performance issues (bitrate drops, latency)
- `viewer_surge` - Sudden increase in viewer count
- `viewer_drop` - Sudden decrease in viewer count
- `quality_degradation` - Video/audio quality issues
- `connection_issue` - Network or connection problems

### Example

```json
{
  "id": "alert_001",
  "channelId": "ch_001",
  "broadcastId": "br_001",
  "type": "performance",
  "severity": "warning",
  "message": "Bitrate dropped below threshold",
  "details": {
    "currentBitrate": 4500,
    "threshold": 5000,
    "duration": 23
  },
  "timestamp": "2024-01-20T14:25:00Z",
  "resolved": true,
  "resolvedAt": "2024-01-20T14:26:00Z"
}
```

---

## Entity Relationships

```
Channel (1) ──────< (N) Broadcast
    │                    │
    │                    ├──────< (N) Stream
    │                    │
    │                    ├──────< (N) Analytics
    │                    │
    │                    ├──────< (N) Alert
    │                    │
    │                    └──────< (1) Recording
    │
    └──────< (N) ScheduledBroadcast
```

- A **Channel** can have multiple **Broadcasts**
- Each **Broadcast** has one active **Stream** when live
- Each **Broadcast** can have multiple **Analytics** snapshots over time
- Completed **Broadcasts** can have one **Recording**
- A **Channel** can have multiple **Scheduled Broadcasts**
- **Alerts** are associated with both a **Channel** and a **Broadcast**