# Analytics Service Documentation

## Overview

The Analytics Service provides comprehensive streaming analytics, viewer metrics, engagement tracking, and performance monitoring for live broadcasts and VOD content. It runs on port 3005 and offers real-time and historical analytics data.

## Base URL

```
http://localhost:3005
```

## Health Check

### GET /health
Returns the health status of the analytics service.

**Response:**
```json
{
  "ok": true,
  "service": "analytics-service"
}
```

---

## API Endpoints

### Broadcast Analytics

#### GET /api/analytics/broadcasts/:broadcastId
Retrieves comprehensive analytics for a specific broadcast.

**Parameters:**
- `broadcastId` (path) - The unique identifier of the broadcast (e.g., "br_001")

**Response:**
```json
{
  "broadcastId": "br_001",
  "analytics": {
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
    }
  },
  "history": []
}
```

**Error Responses:**
- `404` - Broadcast not found or no analytics data available

---

#### GET /api/analytics/broadcasts/:broadcastId/viewers/realtime
Get real-time viewer count with trend analysis for a live broadcast.

**Parameters:**
- `broadcastId` (path) - The unique identifier of the broadcast

**Response (Live Broadcast):**
```json
{
  "broadcastId": "br_001",
  "status": "live",
  "currentViewers": 15234,
  "peakViewers": 23451,
  "timestamp": "2024-01-20T14:35:00Z",
  "trend": "up",
  "changePercent": "2.34"
}
```

**Response (Non-Live Broadcast):**
```json
{
  "broadcastId": "br_003",
  "status": "completed",
  "currentViewers": 0,
  "peakViewers": 8923
}
```

---

#### GET /api/analytics/broadcasts/:broadcastId/viewers/timeseries
Get historical viewer count data as a time series.

**Query Parameters:**
- `interval` (optional, default: "5") - Interval in minutes between data points
- `duration` (optional, default: "60") - Total duration in minutes

**Response:**
```json
{
  "broadcastId": "br_001",
  "interval": "5m",
  "duration": "60m",
  "dataPoints": 12,
  "data": [
    {
      "timestamp": "2024-01-20T13:00:00Z",
      "value": 10234
    },
    {
      "timestamp": "2024-01-20T13:05:00Z",
      "value": 12456
    }
  ]
}
```

---

### Engagement Metrics

#### GET /api/analytics/broadcasts/:broadcastId/engagement
Retrieve detailed engagement metrics for a broadcast.

**Parameters:**
- `broadcastId` (path) - The unique identifier of the broadcast

**Response:**
```json
{
  "broadcastId": "br_001",
  "metrics": {
    "engagementRate": 0.78,
    "averageViewDuration": 1847,
    "chatMessages": 4523,
    "likes": 892,
    "shares": 234,
    "messagesPerMinute": 147,
    "likeRate": "0.059",
    "shareRate": "0.015"
  },
  "timestamp": "2024-01-20T14:30:00Z"
}
```

---

### Demographics

#### GET /api/analytics/broadcasts/:broadcastId/demographics
Get demographic breakdown of viewers.

**Response:**
```json
{
  "broadcastId": "br_001",
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
  "timestamp": "2024-01-20T14:30:00Z"
}
```

---

#### GET /api/analytics/broadcasts/:broadcastId/geography
Get geographic distribution of viewers with estimated counts.

**Response:**
```json
{
  "broadcastId": "br_001",
  "geography": [
    {
      "region": "US",
      "percentage": 45,
      "estimatedViewers": 6855
    },
    {
      "region": "EU",
      "percentage": 30,
      "estimatedViewers": 4570
    }
  ],
  "timestamp": "2024-01-20T14:30:00Z"
}
```

---

#### GET /api/analytics/broadcasts/:broadcastId/devices
Get device and platform breakdown for viewers.

**Response:**
```json
{
  "broadcastId": "br_001",
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
  },
  "timestamp": "2024-01-20T14:30:00Z"
}
```

---

### Quality Metrics

#### GET /api/analytics/broadcasts/:broadcastId/quality
Get streaming quality metrics and overall quality score.

**Response:**
```json
{
  "broadcastId": "br_001",
  "quality": {
    "averageBitrate": 5800,
    "bufferingRate": 0.02,
    "startupTime": 1.2,
    "rebufferCount": 0.3,
    "overallScore": "85.50",
    "rating": "excellent"
  },
  "timestamp": "2024-01-20T14:30:00Z"
}
```

**Quality Rating Scale:**
- `excellent` - Score > 80
- `good` - Score 60-80
- `fair` - Score 40-60
- `poor` - Score < 40

---

### Watch Time Analytics

#### GET /api/analytics/broadcasts/:broadcastId/watch-time
Get watch time distribution analysis.

**Response:**
```json
{
  "broadcastId": "br_001",
  "averageWatchTime": 1847,
  "totalWatchTime": 28156920,
  "distribution": [
    { "range": "0-5 min", "count": 2285, "percentage": 15 },
    { "range": "5-15 min", "count": 3809, "percentage": 25 },
    { "range": "15-30 min", "count": 4570, "percentage": 30 },
    { "range": "30-60 min", "count": 3047, "percentage": 20 },
    { "range": "60+ min", "count": 1523, "percentage": 10 }
  ],
  "timestamp": "2024-01-20T14:30:00Z"
}
```

---

### Channel Analytics

#### GET /api/analytics/channels/:channelId
Get aggregated analytics summary for a channel.

**Parameters:**
- `channelId` (path) - The unique identifier of the channel (e.g., "ch_001")

**Response:**
```json
{
  "channelId": "ch_001",
  "channelName": "TechTV Network",
  "summary": {
    "totalBroadcasts": 25,
    "liveBroadcasts": 1,
    "completedBroadcasts": 24,
    "totalViews": 458920,
    "totalWatchTime": 892340,
    "averagePeakViewers": 15234,
    "currentViewers": 15234
  },
  "period": "all-time",
  "timestamp": "2024-01-20T14:35:00Z"
}
```

---

#### GET /api/analytics/channels/:channelId/compare
Compare the most recent broadcast with the previous one.

**Response:**
```json
{
  "current": {
    "id": "br_001",
    "title": "CES 2024 Keynote Coverage",
    "peakViewers": 23451,
    "totalViews": 45678,
    "duration": 5400
  },
  "previous": {
    "id": "br_003",
    "title": "AI Workshop: Building with LLMs",
    "peakViewers": 8923,
    "totalViews": 12456,
    "duration": 8100
  },
  "changes": {
    "peakViewers": 14528,
    "peakViewersPercent": "162.81",
    "totalViews": 33222,
    "totalViewsPercent": "266.67"
  }
}
```

**Error Responses:**
- `404` - Channel not found
- `400` - Not enough broadcasts to compare (requires at least 2)

---

### Top Broadcasts

#### GET /api/analytics/broadcasts/top
Get top performing broadcasts across all channels or a specific channel.

**Query Parameters:**
- `metric` (optional, default: "peakViewers") - Metric to sort by (e.g., "peakViewers", "totalViews", "duration")
- `limit` (optional, default: 10) - Maximum number of results
- `channelId` (optional) - Filter by specific channel

**Response:**
```json
{
  "metric": "peakViewers",
  "limit": 10,
  "broadcasts": [
    {
      "id": "br_002",
      "title": "NBA Finals Game 7",
      "channelName": "Sports Arena Live",
      "status": "live",
      "peakViewers": 52340,
      "startedAt": "2024-01-20T14:00:00Z"
    },
    {
      "id": "br_001",
      "title": "CES 2024 Keynote Coverage",
      "channelName": "TechTV Network",
      "status": "live",
      "peakViewers": 23451,
      "startedAt": "2024-01-20T13:00:00Z"
    }
  ]
}
```

---

## Data Models

### Analytics Object
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
    "regions": {},
    "devices": {},
    "platforms": {}
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

## Key Metrics Explained

### Engagement Rate
A value between 0 and 1 representing the ratio of engaged viewers (those who interact via chat, likes, or shares) to total viewers.

### Average View Duration
The average time in seconds that viewers spend watching the broadcast.

### Total Watch Time
The cumulative watch time across all viewers in seconds.

### Buffering Rate
The percentage of time viewers experience buffering, expressed as a decimal (0.02 = 2%).

### Startup Time
The average time in seconds for the stream to start playing after a viewer initiates playback.

### Rebuffer Count
The average number of rebuffering events per viewer during the stream.

---

## Use Cases

1. **Real-time Monitoring**: Use `/viewers/realtime` to monitor live viewership and detect trends
2. **Post-broadcast Analysis**: Use engagement, quality, and watch-time endpoints for comprehensive post-stream reports
3. **Audience Insights**: Use demographics and geography endpoints to understand your audience
4. **Performance Benchmarking**: Use channel compare and top broadcasts to measure performance over time
5. **Quality Assurance**: Use quality metrics to ensure optimal streaming experience