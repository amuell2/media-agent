# Troubleshooting Guide for Media Streaming and Broadcasting

## Overview

This document provides troubleshooting guidance for common issues in streaming, broadcasting, and CDN services. Use this reference to diagnose problems, understand error conditions, and implement solutions.

---

## Stream Health Issues

### High Latency

**Symptoms:**
- Stream latency exceeds 5 seconds
- Viewers report significant delay compared to live events
- Chat interactions feel disconnected from content

**Possible Causes:**
1. Network congestion between encoder and ingest server
2. Transcoding delays at the origin
3. CDN edge caching issues
4. Client-side buffering problems

**Diagnostic Steps:**
```
GET /api/streams/{streamId}/health
```

Check the `latency` field in the response. Normal values are 1-3 seconds.

**Solutions:**
- Switch to a lower-latency protocol (SRT instead of RTMP)
- Reduce keyframe interval to 1-2 seconds
- Enable low-latency HLS (LL-HLS) if supported
- Use regional ingest endpoints closer to the encoder

### Dropped Frames

**Symptoms:**
- Video stuttering or jerky playback
- `droppedFrames` count increasing rapidly
- Visual quality degradation

**Possible Causes:**
1. Encoder CPU/GPU overload
2. Insufficient upload bandwidth
3. Network packet loss
4. Bitrate set too high for connection

**Diagnostic Steps:**
```
GET /api/streams/{streamId}/stats
```

Review the `droppedFrames` metric over time. More than 1% dropped frames indicates a problem.

**Solutions:**
- Reduce output bitrate (try 80% of current value)
- Lower resolution or frame rate
- Use hardware encoding (NVENC, QuickSync)
- Check network stability with connection test:
```
POST /api/streams/test-connection
{
  "ingestUrl": "rtmp://ingest.example.com/live/streamkey",
  "protocol": "RTMP"
}
```

### Poor Buffer Health

**Symptoms:**
- Buffer health drops below 80%
- Frequent rebuffering on client side
- Stream interruptions

**Possible Causes:**
1. Unstable upload connection
2. CDN origin issues
3. Excessive network jitter

**Diagnostic Steps:**
Check `bufferHealth` and `networkJitter` in stream health endpoint.

**Solutions:**
- Increase encoder buffer size
- Enable adaptive bitrate streaming
- Consider using SRT protocol for better error correction
- Check CDN edge server health

---

## Broadcast Issues

### Broadcast Won't Start

**Error Response:**
```json
{
  "error": "Broadcast is already live"
}
```

**Cause:** Attempting to start a broadcast that's already running.

**Solution:** Check broadcast status first:
```
GET /api/broadcasts/{broadcastId}
```

### Broadcast Won't Stop

**Error Response:**
```json
{
  "error": "Broadcast is not live"
}
```

**Cause:** Attempting to stop a broadcast that isn't in "live" status.

**Solution:** Verify broadcast status is "live" before stopping.

### Cannot Delete Live Broadcast

**Error Response:**
```json
{
  "error": "Cannot delete a live broadcast. Stop it first."
}
```

**Solution:** First stop the broadcast:
```
POST /api/broadcasts/{broadcastId}/stop
```

Then delete:
```
DELETE /api/broadcasts/{broadcastId}
```

### Channel Not Found

**Error Response:**
```json
{
  "error": "Channel not found"
}
```

**Cause:** Invalid channelId provided when creating/scheduling broadcast.

**Solution:** List available channels:
```
GET /api/broadcasts?channelId={channelId}
```

---

## CDN and Playback Issues

### HLS Playlist Not Loading

**Symptoms:**
- 404 errors on playlist requests
- Player shows loading indefinitely
- "No playable sources" error

**Diagnostic Steps:**
1. Verify stream is active
2. Check CDN health endpoint:
```
GET /health
```

3. Validate playlist URL format:
   - Live: `/live/{channelName}/playlist.m3u8`
   - VOD: `/vod/{broadcastId}/master.m3u8`

**Solutions:**
- Ensure broadcast is in "live" status for live streams
- For VOD, confirm recording exists and is "completed"
- Clear CDN cache if recently went live

### Segment Download Failures

**Symptoms:**
- Playback stuttering
- Console errors showing failed segment fetches
- Partial video playback

**Possible Causes:**
1. Segment not yet available (live edge)
2. CDN cache miss
3. Origin server overload

**Solutions:**
- Increase player buffer size
- Implement retry logic with exponential backoff
- Check segment availability window in playlist

### Thumbnail Generation Issues

**Symptoms:**
- Missing or broken thumbnails
- Generic placeholder images

**Diagnostic Steps:**
Thumbnails are served at:
- Channels: `/thumbnails/{channelName}.jpg`
- Broadcasts: `/broadcasts/{broadcastId}_thumb.jpg`
- VOD: `/vod/{recordingId}_thumb.jpg`

**Solutions:**
- Verify entity exists in database
- Check URL path formatting
- Use query params for custom sizes: `?w=640&h=360`

---

## Analytics Issues

### No Analytics Data Available

**Error Response:**
```json
{
  "error": "No analytics data available"
}
```

**Cause:** Analytics haven't been collected yet for this broadcast.

**Solutions:**
- Wait for analytics aggregation (typically 1-5 minutes)
- Ensure broadcast has active viewers
- Check broadcast status is "live" or "completed"

### Incorrect Viewer Counts

**Symptoms:**
- Viewer numbers seem inaccurate
- Counts not updating in real-time

**Diagnostic Steps:**
Use real-time viewer endpoint:
```
GET /api/analytics/broadcasts/{broadcastId}/viewers/realtime
```

Response includes trend indicator:
- `"trend": "up"` - viewers increasing
- `"trend": "down"` - viewers decreasing
- `"trend": "stable"` - no significant change

**Notes:**
- Real-time counts have ±10% variance
- Peak viewers are tracked separately
- Historical data available via timeseries endpoint

### Missing Demographic Data

**Symptoms:**
- Demographics endpoint returns empty or null regions/devices

**Cause:** Insufficient sample size for demographic breakdown.

**Solution:** Demographics require minimum viewer threshold. Wait for more viewers or use aggregate channel analytics.

---

## Alert Handling

### Performance Alerts

**Alert Type:** `performance`
**Severities:** `warning`, `critical`

**Example Alert:**
```json
{
  "type": "performance",
  "severity": "warning",
  "message": "Bitrate dropped below threshold",
  "details": {
    "currentBitrate": 4500,
    "threshold": 5000,
    "duration": 23
  }
}
```

**Response Actions:**
1. Check encoder settings
2. Verify network connectivity
3. Consider reducing target bitrate

### Viewer Surge Alerts

**Alert Type:** `viewer_surge`
**Severity:** `info`

**Example Alert:**
```json
{
  "type": "viewer_surge",
  "severity": "info",
  "message": "Viewer count increased by 50% in last 5 minutes",
  "details": {
    "previousCount": 32000,
    "currentCount": 48921,
    "percentageIncrease": 52.88
  }
}
```

**Response Actions:**
1. Monitor CDN capacity
2. Check stream health for degradation
3. Consider scaling origin servers

### Checking Active Alerts

```
GET /api/broadcasts/{broadcastId}/alerts
```

Response includes:
- `total`: All alerts for broadcast
- `unresolved`: Count of active alerts

---

## Quality Score Interpretation

The quality score is calculated based on:
- Buffering rate (40% weight)
- Average bitrate (variable weight based on target)
- Startup time (20% weight)
- Rebuffer count (20% weight)

**Quality Ratings:**
| Score Range | Rating | Action Required |
|-------------|--------|-----------------|
| 80+ | Excellent | None |
| 60-79 | Good | Monitor |
| 40-59 | Fair | Investigate |
| <40 | Poor | Immediate action |

**API Endpoint:**
```
GET /api/analytics/broadcasts/{broadcastId}/quality
```

---

## Service Health Checks

### All Services Health Endpoints

| Service | Port | Endpoint |
|---------|------|----------|
| Streaming API | 3002 | `GET /health` |
| Broadcast API | 3003 | `GET /health` |
| CDN Service | 3004 | `GET /health` |
| Analytics Service | 3005 | `GET /health` |

**Expected Response:**
```json
{
  "ok": true,
  "service": "{service-name}"
}
```

### Service Not Responding

**Diagnostic Steps:**
1. Check if service is running
2. Verify port is not blocked
3. Check service logs for errors

**Common Causes:**
- Port conflict with another application
- Database file not accessible
- Missing dependencies

---

## Error Response Codes

### HTTP Status Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 400 | Bad Request | Missing required fields, invalid parameters |
| 404 | Not Found | Invalid ID for broadcast/stream/channel |
| 500 | Server Error | Database error, internal failure |

### Handling 404 Errors

Always verify entity exists before operations:
```
GET /api/broadcasts/{broadcastId}
GET /api/streams/{streamId}
GET /api/analytics/channels/{channelId}
```

### Handling Validation Errors

**Example Response:**
```json
{
  "error": "channelId and title are required"
}
```

**Solution:** Review API documentation for required fields.

---

## Best Practices for Reliability

### Pre-Broadcast Checklist

1. **Test connection** before going live:
   ```
   POST /api/streams/test-connection
   ```

2. **Verify channel status** is ready:
   ```
   GET /api/streams (filter by channelId)
   ```

3. **Check for scheduling conflicts**:
   ```
   GET /api/broadcasts/scheduled/upcoming?channelId={id}
   ```

### During Broadcast Monitoring

1. Poll health endpoint every 30 seconds:
   ```
   GET /api/streams/{streamId}/health
   ```

2. Monitor alerts:
   ```
   GET /api/broadcasts/{broadcastId}/alerts
   ```

3. Track viewer trends:
   ```
   GET /api/analytics/broadcasts/{broadcastId}/viewers/realtime
   ```

### Post-Broadcast Verification

1. Confirm recording completed:
   ```
   GET /api/vod/broadcasts/{broadcastId}
   ```

2. Review final analytics:
   ```
   GET /api/analytics/broadcasts/{broadcastId}
   ```

3. Compare with previous broadcast:
   ```
   GET /api/analytics/channels/{channelId}/compare
   ```
