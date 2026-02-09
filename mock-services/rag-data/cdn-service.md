# CDN Service Documentation

## Overview

The CDN (Content Delivery Network) Service is a mock server that simulates media content delivery functionality for streaming and broadcasting platforms. It runs on **port 3004** and provides endpoints for serving thumbnails, HLS/DASH playlists, video segments, and VOD (Video on Demand) content.

## Service Details

- **Port**: 3004
- **Base URL**: `http://localhost:3004`
- **Health Check**: `GET /health`

## Core Concepts

### Thumbnails

The CDN generates dynamic SVG placeholder thumbnails for:
- **Channel thumbnails**: Visual representations of streaming channels
- **Broadcast thumbnails**: Preview images for live and recorded broadcasts
- **Scheduled broadcast thumbnails**: Preview images for upcoming broadcasts
- **Recording thumbnails**: Preview images for VOD content

Thumbnails include visual indicators:
- Live broadcasts display a red "LIVE" badge
- VOD content displays a play button overlay and duration badge

### HLS (HTTP Live Streaming)

The service generates HLS playlists in two formats:
- **Master Playlist**: Contains multiple quality variants with different resolutions and bitrates
- **Media Playlist**: Contains individual segment references for a specific quality level

HLS playlists are identified by the `.m3u8` extension.

### DASH (Dynamic Adaptive Streaming over HTTP)

The service generates DASH manifests with the `.mpd` extension for adaptive bitrate streaming.

### Video Segments

Mock `.ts` (MPEG-TS) segments are generated for both live and VOD playback. Segments typically have a 6-second duration.

## API Endpoints

### Health Check

```
GET /health
```

Returns service health status.

**Response:**
```json
{
  "ok": true,
  "service": "cdn-mock"
}
```

### Channel Thumbnails

```
GET /thumbnails/:channelName.jpg
```

Generates a dynamic thumbnail for a channel.

**Query Parameters:**
- `w` (optional): Width in pixels (default: 640)
- `h` (optional): Height in pixels (default: 360)

**Response:** SVG image with appropriate `Content-Type: image/svg+xml` header

**Behavior:**
- Active channels display a green gradient background
- Offline channels display a gray gradient background
- All live channel thumbnails include a "LIVE" badge

### Broadcast Thumbnails

```
GET /broadcasts/:broadcastId_thumb.jpg
```

Generates a dynamic thumbnail for a broadcast.

**Query Parameters:**
- `w` (optional): Width in pixels (default: 640)
- `h` (optional): Height in pixels (default: 360)

**Response:** SVG image

**Behavior:**
- Live broadcasts display a red background with "LIVE" badge
- Completed broadcasts display a purple gradient with play button and duration overlay

### Scheduled Broadcast Thumbnails

```
GET /scheduled/:scheduledId_thumb.jpg
```

Generates a thumbnail for an upcoming scheduled broadcast.

**Query Parameters:**
- `w` (optional): Width in pixels
- `h` (optional): Height in pixels

**Response:** SVG image showing scheduled time and broadcast title

### Recording/VOD Thumbnails

```
GET /vod/:recordingId_thumb.jpg
```

Generates a thumbnail for recorded VOD content.

**Query Parameters:**
- `w` (optional): Width in pixels
- `h` (optional): Height in pixels

**Response:** SVG image with play button and duration badge

### Live Stream Playlists

```
GET /live/:channelName/playlist.m3u8
```

Returns the HLS master playlist for a live channel stream.

**Response:** HLS master playlist with multiple quality variants (1080p, 720p, 480p, 360p)

```
GET /live/:channelName/:resolution/playlist.m3u8
```

Returns the media playlist for a specific resolution.

**Response:** Live HLS media playlist (no `#EXT-X-ENDLIST` tag, continuously updating)

### DASH Manifests

```
GET /live/:channelName/manifest.mpd
```

Returns a DASH manifest for adaptive streaming.

### VOD Playlists

```
GET /vod/:recordingId/master.m3u8
```

Returns the HLS master playlist for VOD content.

**Response:** HLS master playlist for the recording

```
GET /vod/:recordingId/:resolution/playlist.m3u8
```

Returns the media playlist for VOD at a specific resolution.

**Response:** VOD HLS media playlist (includes `#EXT-X-ENDLIST` tag)

### Video Segments

```
GET /vod/:recordingId/:resolution/segment:segmentNum.ts
```

Returns a mock video segment for VOD playback.

**Response:** Binary data representing a video segment

### Preview Clips

```
GET /vod/:recordingId_preview_:clipNum.mp4
```

Returns a mock preview clip for VOD content.

**Response:** Mock MP4 binary data

### VOD Downloads

```
GET /downloads/:broadcastId.mp4
```

Returns download information for a recorded broadcast.

**Response:**
```json
{
  "message": "Download ready",
  "recording": {
    "id": "rec_001",
    "title": "Recording Title",
    "fileSize": 4523456789,
    "format": "mp4",
    "duration": 8100
  },
  "note": "This is a mock endpoint"
}
```

## Playlist Formats

### HLS Master Playlist Example

```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=6220800,RESOLUTION=1920x1080,CODECS="avc1.64001f,mp4a.40.2"
1920x1080/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2764800,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2"
1280x720/playlist.m3u8
```

### HLS Media Playlist Example (VOD)

```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:6.000,
segment0.ts
#EXTINF:6.000,
segment1.ts
#EXT-X-ENDLIST
```

### HLS Live Playlist Example

```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:12345
#EXTINF:6.000,
segment12345.ts
#EXTINF:6.000,
segment12346.ts
```

## Supported Resolutions

The CDN supports the following quality variants:
- **1080p**: 1920x1080 (Full HD)
- **720p**: 1280x720 (HD)
- **480p**: 854x480 (SD)
- **360p**: 640x360 (Low)

## Caching

Thumbnails are served with a cache control header:
```
Cache-Control: public, max-age=300
```

This allows 5 minutes of caching for thumbnail requests.

## Integration with Other Services

The CDN Service integrates with:
- **Media Database**: Reads channel, broadcast, and recording information from `db.json`
- **Streaming API**: Provides playback URLs referenced by stream objects
- **Broadcast API**: Serves thumbnails and VOD content for broadcasts

## Common URL Patterns

| Content Type | URL Pattern |
|-------------|-------------|
| Channel Thumbnail | `/thumbnails/{channelName}.jpg` |
| Broadcast Thumbnail | `/broadcasts/{broadcastId}_thumb.jpg` |
| Live HLS Master | `/live/{channelName}/playlist.m3u8` |
| Live DASH | `/live/{channelName}/manifest.mpd` |
| VOD Master | `/vod/{recordingId}/master.m3u8` |
| VOD Download | `/downloads/{broadcastId}.mp4` |

## Error Handling

The CDN service returns appropriate HTTP status codes:
- **200**: Successful content delivery
- **404**: Content not found
- **500**: Server error

Error responses include a JSON body with an `error` field describing the issue.