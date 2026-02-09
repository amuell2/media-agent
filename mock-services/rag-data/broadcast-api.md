# Broadcast API Service

## Overview

The Broadcast API is a RESTful service for managing live broadcasts, scheduled programming, and related metadata in a streaming/entertainment platform. It runs on **port 3003** and provides endpoints for creating, starting, stopping, and monitoring broadcasts.

## Base URL

```
http://localhost:3003
```

## Health Check

**Endpoint:** `GET /health`

**Response:**
```json
{
  "ok": true,
  "service": "broadcast-api"
}
```

---

## Broadcasts

### List All Broadcasts

**Endpoint:** `GET /api/broadcasts`

**Query Parameters:**
| Parameter | Type   | Default | Description                           |
|-----------|--------|---------|---------------------------------------|
| status    | string | -       | Filter by status: "live", "completed", "scheduled" |
| channelId | string | -       | Filter by channel ID                  |
| limit     | number | 50      | Maximum number of results             |
| offset    | number | 0       | Pagination offset                     |

**Response:**
```json
{
  "broadcasts": [...],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

### Get Broadcast by ID

**Endpoint:** `GET /api/broadcasts/:broadcastId`

**Response:**
```json
{
  "broadcast": {
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
  },
  "channel": {...},
  "stream": {...},
  "analytics": {...}
}
```

### Create a New Broadcast

**Endpoint:** `POST /api/broadcasts`

**Request Body:**
```json
{
  "channelId": "ch_001",
  "title": "My New Broadcast",
  "description": "Description of the broadcast",
  "scheduledEndAt": "2024-01-20T18:00:00Z",
  "tags": ["tech", "live"],
  "language": "en",
  "region": "US"
}
```

**Required Fields:** `channelId`, `title`

**Response:** `201 Created`
```json
{
  "message": "Broadcast created successfully",
  "broadcast": {...}
}
```

### Start a Broadcast

**Endpoint:** `POST /api/broadcasts/:broadcastId/start`

Transitions a broadcast from "scheduled" status to "live" status.

**Response:**
```json
{
  "message": "Broadcast started successfully",
  "broadcast": {...}
}
```

**Errors:**
- `404` - Broadcast not found
- `400` - Broadcast is already live

### Stop a Broadcast

**Endpoint:** `POST /api/broadcasts/:broadcastId/stop`

Transitions a broadcast from "live" to "completed" status.

**Response:**
```json
{
  "message": "Broadcast stopped successfully",
  "broadcast": {...},
  "duration": 5400
}
```

**Errors:**
- `404` - Broadcast not found
- `400` - Broadcast is not live

### Update Broadcast Metadata

**Endpoint:** `PATCH /api/broadcasts/:broadcastId`

**Request Body (all fields optional):**
```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "tags": ["updated", "tags"],
  "thumbnailUrl": "https://cdn.example.com/new-thumb.jpg"
}
```

**Response:**
```json
{
  "message": "Broadcast updated successfully",
  "broadcast": {...}
}
```

### Delete a Broadcast

**Endpoint:** `DELETE /api/broadcasts/:broadcastId`

**Notes:** Cannot delete a live broadcast. Stop it first.

**Response:**
```json
{
  "message": "Broadcast deleted successfully",
  "broadcastId": "br_001"
}
```

**Errors:**
- `404` - Broadcast not found
- `400` - Cannot delete a live broadcast

### Get Broadcast Viewers (Real-time)

**Endpoint:** `GET /api/broadcasts/:broadcastId/viewers`

Returns real-time viewer statistics with simulated fluctuation.

**Response (live broadcast):**
```json
{
  "currentViewers": 15234,
  "peakViewers": 23451,
  "totalViews": 45678,
  "trend": "increasing",
  "timestamp": "2024-01-20T14:30:00Z"
}
```

**Response (non-live broadcast):**
```json
{
  "currentViewers": 0,
  "peakViewers": 23451,
  "totalViews": 45678
}
```

### Get Broadcast Alerts

**Endpoint:** `GET /api/broadcasts/:broadcastId/alerts`

**Response:**
```json
{
  "alerts": [
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
  ],
  "total": 1,
  "unresolved": 0
}
```

---

## Scheduled Broadcasts

### Get Upcoming Scheduled Broadcasts

**Endpoint:** `GET /api/broadcasts/scheduled/upcoming`

**Query Parameters:**
| Parameter | Type   | Default | Description              |
|-----------|--------|---------|--------------------------|
| channelId | string | -       | Filter by channel ID     |
| limit     | number | 10      | Maximum number of results|

**Response:**
```json
{
  "scheduled": [
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
  ],
  "total": 2
}
```

### Schedule a New Broadcast

**Endpoint:** `POST /api/broadcasts/schedule`

**Request Body:**
```json
{
  "channelId": "ch_001",
  "title": "Upcoming Show",
  "description": "Show description",
  "scheduledStart": "2024-01-25T18:00:00Z",
  "estimatedDuration": 3600,
  "tags": ["entertainment"]
}
```

**Required Fields:** `channelId`, `title`, `scheduledStart`

**Response:** `201 Created`
```json
{
  "message": "Broadcast scheduled successfully",
  "scheduled": {...}
}
```

### Cancel Scheduled Broadcast

**Endpoint:** `DELETE /api/broadcasts/scheduled/:scheduledId`

**Response:**
```json
{
  "message": "Scheduled broadcast cancelled",
  "scheduledId": "sch_001"
}
```

---

## Data Models

### Broadcast Object

| Field           | Type     | Description                                    |
|-----------------|----------|------------------------------------------------|
| id              | string   | Unique identifier (e.g., "br_001")            |
| channelId       | string   | Associated channel ID                          |
| title           | string   | Broadcast title                                |
| description     | string   | Broadcast description                          |
| status          | string   | "scheduled", "live", or "completed"           |
| startedAt       | string   | ISO 8601 timestamp when broadcast started      |
| scheduledEndAt  | string   | Planned end time                               |
| actualEndAt     | string   | Actual end time (null if still live)          |
| currentViewers  | number   | Current viewer count                           |
| peakViewers     | number   | Maximum concurrent viewers                     |
| totalViews      | number   | Total unique views                             |
| duration        | number   | Duration in seconds                            |
| thumbnailUrl    | string   | URL to broadcast thumbnail                     |
| vodUrl          | string   | URL to VOD playback (completed broadcasts)    |
| tags            | string[] | Array of content tags                          |
| language        | string   | Primary language code                          |
| region          | string   | Target region                                  |

### Scheduled Broadcast Object

| Field             | Type     | Description                              |
|-------------------|----------|------------------------------------------|
| id                | string   | Unique identifier (e.g., "sch_001")     |
| channelId         | string   | Associated channel ID                    |
| title             | string   | Broadcast title                          |
| description       | string   | Broadcast description                    |
| scheduledStart    | string   | ISO 8601 timestamp for start time        |
| estimatedDuration | number   | Expected duration in seconds             |
| status            | string   | "scheduled"                              |
| thumbnailUrl      | string   | URL to placeholder thumbnail             |
| tags              | string[] | Array of content tags                    |
| notificationsSent | number   | Number of notifications sent to users    |
| expectedViewers   | number   | Predicted viewer count                   |

### Alert Object

| Field      | Type    | Description                                    |
|------------|---------|------------------------------------------------|
| id         | string  | Unique identifier                              |
| channelId  | string  | Associated channel ID                          |
| broadcastId| string  | Associated broadcast ID                        |
| type       | string  | Alert type: "performance", "viewer_surge", etc.|
| severity   | string  | "info", "warning", "error", "critical"        |
| message    | string  | Human-readable alert message                   |
| details    | object  | Additional context-specific data               |
| timestamp  | string  | When the alert was triggered                   |
| resolved   | boolean | Whether the alert has been resolved            |
| resolvedAt | string  | When the alert was resolved (if applicable)   |

---

## Broadcast Lifecycle

1. **Create** - A new broadcast is created with status "scheduled"
2. **Start** - The broadcast transitions to "live" status
3. **Monitor** - Track viewers, alerts, and metrics in real-time
4. **Stop** - The broadcast transitions to "completed" status
5. **Archive** - Completed broadcasts can be accessed for VOD playback

---

## Error Responses

All errors follow this format:
```json
{
  "error": "Error message description"
}
```

Common HTTP status codes:
- `400` - Bad Request (missing required fields, invalid operation)
- `404` - Not Found (broadcast or channel doesn't exist)
- `500` - Internal Server Error