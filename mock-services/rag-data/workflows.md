# Common Workflows and Use Cases

## Live Broadcasting Workflows

### Starting a Live Broadcast (Complete Flow)

**Scenario**: A channel wants to go live with a new broadcast.

**Step-by-Step Process**:

1. **Create a broadcast** via Broadcast API
   - `POST /api/broadcasts` with channelId, title, description, tags
   - Broadcast is created in "scheduled" status
   - Returns broadcast ID for subsequent operations

2. **Start the stream** via Streaming API
   - `POST /api/streams/start` with channelId, broadcastId, protocol, quality
   - Creates stream with ingest URL and playback URLs
   - Stream health monitoring begins

3. **Start the broadcast** via Broadcast API
   - `POST /api/broadcasts/{broadcastId}/start`
   - Changes broadcast status from "scheduled" to "live"
   - Updates channel status to "active"

4. **Verify CDN delivery**
   - Check HLS playlist: `GET /live/{channelName}/playlist.m3u8`
   - Verify thumbnail generation: `GET /thumbnails/{channelName}.jpg`

5. **Monitor during broadcast**
   - Stream health: `GET /api/streams/{streamId}/health`
   - Real-time viewers: `GET /api/analytics/broadcasts/{broadcastId}/viewers/realtime`
   - Engagement: `GET /api/analytics/broadcasts/{broadcastId}/engagement`

### Ending a Live Broadcast

**Step-by-Step Process**:

1. **Stop the stream** via Streaming API
   - `POST /api/streams/{streamId}/stop`
   - Removes stream from active list
   - Updates broadcast status to "completed"

2. **Verify broadcast ended** via Broadcast API
   - `GET /api/broadcasts/{broadcastId}`
   - Confirm status is "completed"
   - Confirm duration was calculated

3. **Check for VOD creation** via CDN
   - VOD playlist: `GET /vod/{broadcastId}/master.m3u8`
   - Recording download: `GET /downloads/{broadcastId}.mp4`

---

## Monitoring and Analytics Workflows

### Real-Time Monitoring Dashboard

**Goal**: Display live metrics for an ongoing broadcast.

**Required API Calls** (refreshed periodically):

| Metric | Endpoint | Refresh Rate |
|--------|----------|--------------|
| Viewer count | `/api/analytics/broadcasts/{id}/viewers/realtime` | 5 seconds |
| Stream health | `/api/streams/{streamId}/health` | 10 seconds |
| Engagement | `/api/analytics/broadcasts/{id}/engagement` | 30 seconds |
| Quality | `/api/analytics/broadcasts/{id}/quality` | 30 seconds |
| Alerts | `/api/broadcasts/{id}/alerts` | 15 seconds |

**Sample Implementation**:
```javascript
async function refreshDashboard(broadcastId, streamId) {
  const [viewers, health, engagement, alerts] = await Promise.all([
    fetch(`http://localhost:3005/api/analytics/broadcasts/${broadcastId}/viewers/realtime`),
    fetch(`http://localhost:3002/api/streams/${streamId}/health`),
    fetch(`http://localhost:3005/api/analytics/broadcasts/${broadcastId}/engagement`),
    fetch(`http://localhost:3003/api/broadcasts/${broadcastId}/alerts`)
  ]);
  
  return {
    viewers: await viewers.json(),
    health: await health.json(),
    engagement: await engagement.json(),
    alerts: await alerts.json()
  };
}
```

### Post-Broadcast Analytics Review

**Goal**: Analyze performance after a broadcast ends.

**API Sequence**:

1. Get broadcast summary: `GET /api/broadcasts/{broadcastId}`
2. Get final analytics: `GET /api/analytics/broadcasts/{broadcastId}`
3. Get viewer time-series: `GET /api/analytics/broadcasts/{broadcastId}/viewers/timeseries`
4. Get demographics: `GET /api/analytics/broadcasts/{broadcastId}/demographics`
5. Get geographic distribution: `GET /api/analytics/broadcasts/{broadcastId}/geography`
6. Get device breakdown: `GET /api/analytics/broadcasts/{broadcastId}/devices`
7. Get watch time distribution: `GET /api/analytics/broadcasts/{broadcastId}/watch-time`

---

## Channel Management Workflows

### Channel Health Check

**Goal**: Verify a channel is ready for broadcasting.

**Checks to Perform**:

1. **Get channel info**: `GET /api/streams/{streamId}` (includes channel data)
2. **Test ingest connection**: `POST /api/streams/test-connection`
3. **Verify CDN accessibility**: `GET /thumbnails/{channelName}.jpg`
4. **Check for active alerts**: Review alert history

**Sample Health Check**:
```javascript
async function checkChannelHealth(channelId) {
  const issues = [];
  
  // Test RTMP connection
  const rtmpTest = await fetch('http://localhost:3002/api/streams/test-connection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ingestUrl: `rtmp://ingest.example.com/live/${channelId}`,
      protocol: 'RTMP'
    })
  });
  
  const rtmpResult = await rtmpTest.json();
  if (!rtmpResult.success) {
    issues.push({ type: 'connection', message: 'RTMP ingest unreachable' });
  }
  
  // Check CDN
  const cdnResponse = await fetch(`http://localhost:3004/thumbnails/${channelId}.jpg`);
  if (!cdnResponse.ok) {
    issues.push({ type: 'cdn', message: 'CDN not serving content' });
  }
  
  return { healthy: issues.length === 0, issues };
}
```

### Channel Performance Comparison

**Goal**: Compare a channel's performance over time.

**API Calls**:

1. Get channel summary: `GET /api/analytics/channels/{channelId}`
2. Get top broadcasts: `GET /api/analytics/broadcasts/top?channelId={channelId}`
3. Compare recent broadcasts: `GET /api/analytics/channels/{channelId}/compare`

---

## Scheduled Content Workflows

### Scheduling a Future Broadcast

**Step-by-Step**:

1. **Schedule the broadcast**:
   ```
   POST /api/broadcasts/schedule
   {
     "channelId": "ch_001",
     "title": "Weekly Tech Roundup",
     "description": "Review of the week's biggest tech news",
     "scheduledStart": "2024-01-21T18:00:00Z",
     "estimatedDuration": 3600,
     "tags": ["tech", "news", "weekly"]
   }
   ```

2. **Monitor scheduled broadcasts**:
   ```
   GET /api/broadcasts/scheduled/upcoming?channelId=ch_001
   ```

3. **When ready, convert to live broadcast**:
   - Create broadcast from scheduled event
   - Start stream
   - Start broadcast

### Canceling a Scheduled Broadcast

```
DELETE /api/broadcasts/scheduled/{scheduledId}
```

---

## Content Delivery Workflows

### Setting Up Playback for Different Platforms

**Available Formats**:

| Platform | Format | Endpoint |
|----------|--------|----------|
| Web browsers | HLS | `/live/{channel}/playlist.m3u8` |
| Smart TVs | DASH | `/live/{channel}/manifest.mpd` |
| Legacy apps | RTMP | `rtmp://streaming.example.com/live/{channel}` |

**Get All Playback URLs**:
```
GET /api/streams/{streamId}/playback
```

**Get Specific Format**:
```
GET /api/streams/{streamId}/playback?format=hls
```

### VOD Playback Setup

After a broadcast ends:

1. **Master playlist**: `GET /vod/{broadcastId}/master.m3u8`
2. **Resolution-specific**: `GET /vod/{broadcastId}/{resolution}/playlist.m3u8`
3. **Preview clips**: `GET /vod/{broadcastId}/preview_{n}.mp4`
4. **Full download**: `GET /downloads/{broadcastId}.mp4`

---

## Troubleshooting Workflows

### Diagnosing Stream Quality Issues

**Symptoms**: Buffering, poor video quality, dropped frames

**Investigation Steps**:

1. **Check stream health**:
   ```
   GET /api/streams/{streamId}/health
   ```
   Look for: high latency (>5s), low buffer health (<80%), dropped frames

2. **Check quality metrics**:
   ```
   GET /api/analytics/broadcasts/{broadcastId}/quality
   ```
   Look for: high buffering rate (>0.05), high rebuffer count

3. **Get historical stats**:
   ```
   GET /api/streams/{streamId}/stats
   ```
   Look for: bitrate fluctuations, consistent dropped frames

4. **Check alerts**:
   ```
   GET /api/broadcasts/{broadcastId}/alerts
   ```
   Look for: performance warnings

**Common Issues and Solutions**:

| Issue | Indicator | Solution |
|-------|-----------|----------|
| Network instability | High jitter (>2.0) | Check network connection |
| Encoder overload | High dropped frames | Reduce output resolution/fps |
| Bandwidth insufficient | Bitrate drops | Lower bitrate setting |
| CDN issues | High buffering rate | Check CDN status |

### Diagnosing Low Viewership

**Investigation Steps**:

1. **Check broadcast discoverability**:
   - Verify thumbnail is loading
   - Check tags and metadata

2. **Compare to historical performance**:
   ```
   GET /api/analytics/channels/{channelId}/compare
   ```

3. **Analyze viewer demographics**:
   ```
   GET /api/analytics/broadcasts/{broadcastId}/demographics
   ```
   Check if target audience is reached

4. **Review engagement metrics**:
   ```
   GET /api/analytics/broadcasts/{broadcastId}/engagement
   ```
   Low engagement rate may indicate content issues

---

## Multi-Service Integration Patterns

### Coordinator Pattern

For operations spanning multiple services, use a coordinator approach:

```javascript
class BroadcastCoordinator {
  async startLiveBroadcast(channelId, title, description) {
    // 1. Create broadcast
    const broadcast = await this.broadcastApi.createBroadcast({
      channelId, title, description
    });
    
    // 2. Start stream
    const stream = await this.streamingApi.startStream({
      channelId,
      broadcastId: broadcast.id,
      protocol: 'RTMP',
      quality: { resolution: '1920x1080', bitrate: 6000, fps: 60 }
    });
    
    // 3. Start broadcast
    await this.broadcastApi.startBroadcast(broadcast.id);
    
    // 4. Return combined info
    return {
      broadcast,
      stream,
      playbackUrls: stream.playbackUrls,
      cdnUrls: {
        hls: `http://localhost:3004/live/${channelId}/playlist.m3u8`,
        thumbnail: `http://localhost:3004/thumbnails/${channelId}.jpg`
      }
    };
  }
  
  async endLiveBroadcast(streamId, broadcastId) {
    // 1. Stop stream (also updates broadcast)
    await this.streamingApi.stopStream(streamId);
    
    // 2. Get final analytics
    const analytics = await this.analyticsService.getBroadcastAnalytics(broadcastId);
    
    // 3. Get recording info
    const recording = await this.cdnService.getRecording(broadcastId);
    
    return { analytics, recording };
  }
}
```

### Health Aggregation Pattern

Combine health checks from all services:

```javascript
async function getSystemHealth() {
  const services = [
    { name: 'streaming', url: 'http://localhost:3002/health' },
    { name: 'broadcast', url: 'http://localhost:3003/health' },
    { name: 'cdn', url: 'http://localhost:3004/health' },
    { name: 'analytics', url: 'http://localhost:3005/health' }
  ];
  
  const results = await Promise.allSettled(
    services.map(s => fetch(s.url).then(r => r.json()))
  );
  
  return services.map((service, i) => ({
    service: service.name,
    status: results[i].status === 'fulfilled' ? 'healthy' : 'unhealthy',
    details: results[i].value || results[i].reason
  }));
}
```

---

## Error Handling Patterns

### Retry with Exponential Backoff

For transient failures:

```javascript
async function withRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
}
```

### Graceful Degradation

When analytics service is down, continue with core functionality:

```javascript
async function getBroadcastWithAnalytics(broadcastId) {
  const broadcast = await broadcastApi.getBroadcast(broadcastId);
  
  try {
    broadcast.analytics = await analyticsService.getBroadcastAnalytics(broadcastId);
  } catch (error) {
    broadcast.analytics = null;
    broadcast.analyticsError = 'Analytics temporarily unavailable';
  }
  
  return broadcast;
}
```
