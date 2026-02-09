# Streaming API Service

## Overview

The Streaming API service manages live video streams for broadcasting. It handles stream creation, monitoring, quality control, and playback URL generation. This service runs on port 3002.

## Base URL

```
http://localhost:3002
```

## Health Check

### GET /health

Check if the streaming service is running.

**Response:**
```json
{
  "ok": true,
  "service": "streaming-api"
}
```

---

## Endpoints

### GET /api/streams

Retrieve all currently active streams.

**Response:**
```json
{
  "streams": [...],
  "total": 2
}
```

**Notes:**
- Only returns streams that have an associated broadcast with status "live"
- Inactive or completed streams are not included

---

### GET /api/streams/:streamId

Get detailed information about a specific stream.

**Path Parameters:**
- `streamId` (string): The unique stream identifier (e.g., "st_001")

**Response:**
```json
{
  "stream": {
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
  },
  "broadcast": {...},
  "channel": {...}
}
```

**Error Responses:**
- `404`: Stream not found

---

### GET /api/streams/:streamId/health

Get real-time health metrics for a stream.

**Path Parameters:**
- `streamId` (string): The unique stream identifier

**Response:**
```json
{
  "status": "healthy",
  "latency": 2.3,
  "bufferHealth": 95,
  "droppedFrames": 12,
  "networkJitter": 1.2,
  "timestamp": "2024-01-20T14:30:00Z"
}
```

**Health Metrics Explained:**
- `status`: Overall health status ("healthy", "degraded", "critical")
- `latency`: End-to-end latency in seconds (lower is better)
- `bufferHealth`: Buffer fill percentage (0-100, higher is better)
- `droppedFrames`: Total number of dropped frames since stream start
- `networkJitter`: Network jitter in seconds (lower is better)

**Error Responses:**
- `404`: Stream not found

---

### POST /api/streams/start

Start a new stream for a broadcast.

**Request Body:**
```json
{
  "channelId": "ch_001",
  "broadcastId": "br_001",
  "protocol": "RTMP",
  "quality": {
    "resolution": "1920x1080",
    "bitrate": 6000,
    "fps": 60,
    "codec": "H.264"
  }
}
```

**Required Fields:**
- `channelId`: The channel to stream on
- `broadcastId`: The broadcast this stream belongs to

**Optional Fields:**
- `protocol`: Streaming protocol (default: "RTMP"). Options: "RTMP", "SRT", "WebRTC"
- `quality`: Stream quality settings

**Response (201 Created):**
```json
{
  "message": "Stream started successfully",
  "stream": {
    "id": "st_1705759200000",
    "broadcastId": "br_001",
    "channelId": "ch_001",
    "protocol": "RTMP",
    "ingestUrl": "rtmp://ingest.example.com/live/...",
    "playbackUrls": {...},
    "quality": {...},
    "health": {...},
    "startedAt": "2024-01-20T14:00:00Z"
  }
}
```

**Error Responses:**
- `404`: Channel not found

---

### POST /api/streams/:streamId/stop

Stop an active stream.

**Path Parameters:**
- `streamId` (string): The unique stream identifier

**Response:**
```json
{
  "message": "Stream stopped successfully",
  "streamId": "st_001",
  "endedAt": "2024-01-20T16:00:00Z"
}
```

**Side Effects:**
- The associated broadcast status is set to "completed"
- The stream is removed from the active streams list

**Error Responses:**
- `404`: Stream not found

---

### PATCH /api/streams/:streamId/quality

Update the quality settings of an active stream.

**Path Parameters:**
- `streamId` (string): The unique stream identifier

**Request Body:**
```json
{
  "resolution": "1280x720",
  "bitrate": 4000,
  "fps": 30
}
```

**All fields are optional.** Only provided fields will be updated.

**Response:**
```json
{
  "message": "Stream quality updated",
  "quality": {
    "resolution": "1280x720",
    "bitrate": 4000,
    "fps": 30,
    "codec": "H.264"
  }
}
```

**Error Responses:**
- `404`: Stream not found

---

### GET /api/streams/:streamId/stats

Get time-series statistics for a stream (last 5 minutes).

**Path Parameters:**
- `streamId` (string): The unique stream identifier

**Response:**
```json
{
  "streamId": "st_001",
  "interval": "10s",
  "data": [
    {
      "timestamp": "2024-01-20T14:25:00Z",
      "bitrate": 6000,
      "fps": 60,
      "droppedFrames": 2,
      "latency": 2.1,
      "bufferHealth": 96
    },
    ...
  ]
}
```

**Notes:**
- Data points are collected every 10 seconds
- Returns approximately 30 data points (5 minutes / 10 seconds)

**Error Responses:**
- `404`: Stream not found

---

### GET /api/streams/:streamId/playback

Get playback URLs for a stream.

**Path Parameters:**
- `streamId` (string): The unique stream identifier

**Query Parameters:**
- `format` (optional): Specific format to return. Options: "hls", "dash", "rtmp", "all" (default: "all")

**Response (format=all):**
```json
{
  "hls": "http://localhost:3004/live/techTV/playlist.m3u8",
  "dash": "http://localhost:3004/live/techTV/manifest.mpd",
  "rtmp": "rtmp://streaming.example.com/live/techTV"
}
```

**Response (format=hls):**
```json
{
  "format": "hls",
  "url": "http://localhost:3004/live/techTV/playlist.m3u8"
}
```

**Error Responses:**
- `400`: Invalid format requested
- `404`: Stream not found

---

### POST /api/streams/test-connection

Test connectivity to an ingest server.

**Request Body:**
```json
{
  "ingestUrl": "rtmp://ingest.example.com/live/stream_key",
  "protocol": "RTMP"
}
```

**Required Fields:**
- `ingestUrl`: The ingest URL to test
- `protocol`: The protocol being used

**Response:**
```json
{
  "success": true,
  "protocol": "RTMP",
  "latency": 87,
  "message": "Connection test successful",
  "timestamp": "2024-01-20T14:30:00Z"
}
```

**Notes:**
- Simulates a connection test with ~90% success rate
- Latency is returned in milliseconds
- Response is delayed to simulate actual connection testing

**Error Responses:**
- `400`: Missing required fields

---

## Data Models

### Stream Object

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique stream identifier (e.g., "st_001") |
| broadcastId | string | Associated broadcast ID |
| channelId | string | Channel the stream is on |
| protocol | string | Streaming protocol (RTMP, SRT, WebRTC) |
| ingestUrl | string | URL where the encoder sends the stream |
| playbackUrls | object | URLs for viewers to watch the stream |
| quality | object | Current quality settings |
| health | object | Real-time health metrics |
| startedAt | string | ISO 8601 timestamp of stream start |

### Quality Object

| Field | Type | Description |
|-------|------|-------------|
| resolution | string | Video resolution (e.g., "1920x1080") |
| bitrate | number | Bitrate in kbps |
| fps | number | Frames per second |
| codec | string | Video codec (e.g., "H.264", "H.265") |

### Health Object

| Field | Type | Description |
|-------|------|-------------|
| status | string | Overall status: "healthy", "degraded", "critical" |
| latency | number | End-to-end latency in seconds |
| bufferHealth | number | Buffer fill percentage (0-100) |
| droppedFrames | number | Total dropped frames |
| networkJitter | number | Network jitter in seconds |

---

## Streaming Protocols

### RTMP (Real-Time Messaging Protocol)
- Most widely supported protocol
- Low latency (~2-5 seconds)
- Good for most use cases
- Uses port 1935 by default

### SRT (Secure Reliable Transport)
- Modern protocol with built-in encryption
- Better error correction than RTMP
- Handles poor network conditions well
- Ideal for professional broadcasting

### WebRTC
- Ultra-low latency (<1 second)
- Browser-native support
- Best for interactive streams
- Higher infrastructure complexity

---

## Common Workflows

### Starting a New Stream

1. Create a broadcast via Broadcast API
2. Call `POST /api/streams/start` with the broadcastId
3. Configure encoder to push to the returned ingestUrl
4. Share playbackUrls with viewers

### Monitoring Stream Health

1. Poll `GET /api/streams/:streamId/health` periodically
2. Check for degraded or critical status
3. View detailed stats via `GET /api/streams/:streamId/stats`
4. Adjust quality if needed via `PATCH /api/streams/:streamId/quality`

### Ending a Stream

1. Call `POST /api/streams/:streamId/stop`
2. The broadcast is automatically marked as completed
3. Recording is available via CDN service (if enabled)

---

## Quality Presets

### 4K Ultra HD
- Resolution: 3840x2160
- Bitrate: 15000-20000 kbps
- FPS: 60
- Codec: H.265

### 1080p Full HD
- Resolution: 1920x1080
- Bitrate: 5000-8000 kbps
- FPS: 60
- Codec: H.264

### 720p HD
- Resolution: 1280x720
- Bitrate: 2500-4000 kbps
- FPS: 30
- Codec: H.264

### 480p SD
- Resolution: 854x480
- Bitrate: 1000-2000 kbps
- FPS: 30
- Codec: H.264