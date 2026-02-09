# Frequently Asked Questions (FAQs)

This document contains common questions and answers about StreamVerse platform, services, and operations.

---

## Account & Access

### How do I get API access to StreamVerse?

To access the StreamVerse APIs, you need to:
1. Sign up for a StreamVerse Business or Enterprise account
2. Navigate to the Developer Portal at developers.streamverse.io
3. Generate API keys from your dashboard
4. Use the API keys in the `X-API-Key` header for all requests

Contact sales@streamverse.io for enterprise pricing and custom integrations.

### What are the rate limits for API calls?

| Plan | Requests/Minute | Concurrent Streams | Analytics Retention |
|------|-----------------|-------------------|---------------------|
| Starter | 60 | 1 | 7 days |
| Business | 300 | 10 | 30 days |
| Enterprise | 1000+ | Unlimited | 1 year |

Rate limit headers are included in all responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in window
- `X-RateLimit-Reset`: Unix timestamp when limit resets

### How do I reset my stream key?

Stream keys can be reset from the Channel Settings page or via API:
```
POST /api/channels/{channelId}/reset-stream-key
```

**Important**: Resetting your stream key will immediately invalidate the old key. Update your encoder settings before going live.

---

## Streaming & Broadcasting

### What streaming software is compatible with StreamVerse?

StreamVerse supports any software that outputs RTMP or SRT streams, including:
- **OBS Studio** (recommended) - Free, open-source
- **Streamlabs Desktop** - OBS-based with additional features
- **Wirecast** - Professional broadcasting software
- **vMix** - Windows-based production software
- **XSplit** - Gaming-focused streaming
- **Restream Studio** - Browser-based option
- **FFmpeg** - Command-line tool for advanced users

### What are the recommended encoder settings?

**For 1080p60 streaming:**
- Resolution: 1920x1080
- Frame Rate: 60 fps
- Bitrate: 6000-8000 kbps
- Keyframe Interval: 2 seconds
- Codec: H.264 (x264 or hardware encoder)
- Audio: AAC, 128-320 kbps, 48kHz

**For 4K streaming (Enterprise only):**
- Resolution: 3840x2160
- Frame Rate: 60 fps
- Bitrate: 15000-20000 kbps
- Codec: H.265 (HEVC) recommended
- Requires SRT protocol

### Why is my stream not starting?

Common causes and solutions:

1. **Invalid stream key**: Verify you're using the correct stream key from your channel settings
2. **Wrong ingest URL**: Use the regional ingest server closest to you
3. **Firewall blocking**: Ensure port 1935 (RTMP) or 9998 (SRT) is open
4. **Bitrate too high**: Try reducing bitrate to 6000 kbps
5. **Encoder misconfiguration**: Check that you're using H.264 codec with AAC audio

### How do I reduce stream latency?

To achieve lower latency:

1. **Use SRT protocol** instead of RTMP (reduces latency by 2-3 seconds)
2. **Enable Low-Latency HLS** in channel settings
3. **Reduce keyframe interval** to 1 second
4. **Use regional ingest servers** closest to your location
5. **Reduce encoder buffer** settings

Expected latency by configuration:
| Configuration | Typical Latency |
|--------------|-----------------|
| Standard HLS | 15-30 seconds |
| Low-Latency HLS | 3-5 seconds |
| SRT + LL-HLS | 2-3 seconds |
| WebRTC (Beta) | < 1 second |

### Can I stream to multiple platforms simultaneously?

Yes! StreamVerse supports simulcasting to:
- YouTube Live
- Twitch
- Facebook Live
- LinkedIn Live
- Custom RTMP destinations

Configure simulcast destinations in Channel Settings > Simulcast. Note: Simulcasting may require a Business or Enterprise plan and sufficient upload bandwidth.

---

## Playback & Viewers

### What devices support StreamVerse playback?

StreamVerse content plays on:
- **Web browsers**: Chrome, Firefox, Safari, Edge (HLS.js or native)
- **Mobile**: iOS Safari, Android Chrome, native apps
- **Smart TVs**: Samsung, LG, Android TV, Roku, Fire TV
- **Gaming consoles**: PlayStation, Xbox (via browser)
- **Set-top boxes**: Apple TV, Chromecast

### Why are viewers experiencing buffering?

Buffering can occur due to:

1. **Viewer's internet connection**: Recommend minimum 10 Mbps for 1080p
2. **CDN issues**: Check CDN health at status.streamverse.io
3. **Stream quality too high**: Enable Adaptive Bitrate for automatic quality adjustment
4. **Geographic distance**: Ensure CDN edge servers are deployed in viewer regions
5. **Peak traffic**: Contact support for capacity planning during major events

### How does Adaptive Bitrate (ABR) work?

StreamVerse automatically transcodes your stream into multiple quality levels:
- 1080p (6000 kbps)
- 720p (3000 kbps)
- 480p (1500 kbps)
- 360p (800 kbps)

Viewers' players automatically switch between qualities based on their available bandwidth, reducing buffering while maintaining the best possible quality.

---

## Analytics & Metrics

### How real-time are the analytics?

| Metric Type | Update Frequency |
|-------------|------------------|
| Viewer count | Real-time (5 second delay) |
| Stream health | Real-time |
| Engagement (chat, likes) | 30 seconds |
| Demographics | 1 minute |
| Quality metrics | 1 minute |
| Watch time | 5 minutes |

### What does "Engagement Rate" mean?

Engagement Rate is calculated as:
```
Engagement Rate = (Users who interacted) / (Total unique viewers)
```

Interactions include:
- Sending a chat message
- Liking the stream
- Sharing the stream
- Using reactions/emojis
- Clicking interactive elements

A good engagement rate is typically 5-15% for live streams.

### How is Average View Duration calculated?

Average View Duration = Total Watch Time / Number of View Sessions

A "view session" starts when a viewer begins watching and ends when they leave or the stream ends. If a viewer leaves and returns, it counts as two sessions.

### Why don't my viewer numbers match other platforms?

Different platforms count viewers differently:
- **StreamVerse**: Counts unique concurrent connections with >30 seconds watch time
- **Some platforms**: Count all connections regardless of duration
- **Others**: Use sampling or estimation

StreamVerse's methodology follows IAB (Interactive Advertising Bureau) standards for accurate measurement.

---

## Recordings & VOD

### Are my streams automatically recorded?

Recording settings depend on your plan and channel configuration:

| Plan | Auto-Record | Storage | Retention |
|------|-------------|---------|-----------|
| Starter | Optional | 10 GB | 7 days |
| Business | Default On | 100 GB | 90 days |
| Enterprise | Default On | Unlimited | Custom |

Enable/disable auto-recording in Channel Settings > Recording.

### How long until my recording is available?

After a stream ends:
1. **Processing begins**: Immediately
2. **Preview available**: 5-15 minutes (depending on duration)
3. **Full VOD ready**: 15 minutes to 2 hours
4. **Download available**: After full processing

Longer streams take more time to process. You'll receive a webhook notification when processing completes.

### Can I edit my recordings?

StreamVerse provides basic editing features:
- **Trimming**: Remove beginning/end portions
- **Chapters**: Add chapter markers with timestamps
- **Thumbnails**: Upload custom thumbnails
- **Clipping**: Create highlight clips (up to 60 seconds)

For advanced editing, download the recording and use professional editing software.

### What video formats are available for download?

Recordings can be downloaded in:
- **MP4 (H.264)**: Best compatibility, recommended for most uses
- **MP4 (H.265)**: Smaller file size, requires modern devices
- **Original**: Raw recording in source format

---

## Troubleshooting

### My stream keeps disconnecting. What should I do?

1. **Check your internet stability**: Run a speed test at speedtest.net
2. **Reduce bitrate**: Try 80% of your upload speed
3. **Use wired connection**: Avoid WiFi for streaming
4. **Switch ingest servers**: Try a different regional server
5. **Update encoder software**: Ensure you're on the latest version
6. **Check for interference**: Close bandwidth-heavy applications

### Viewers report audio/video sync issues

Audio sync problems are usually caused by:
1. **Encoder settings**: Ensure audio sample rate is 48kHz
2. **Hardware issues**: Check capture card or camera connections
3. **Processing overload**: Reduce encoder preset (try "veryfast" in x264)
4. **Network issues**: Audio packets arriving out of order

Try restarting your encoder. If issues persist, contact StreamVerse support.

### How do I report a technical issue?

1. **Check status page**: status.streamverse.io for known issues
2. **Gather information**:
   - Stream ID and Channel ID
   - Timestamp of the issue
   - Browser/device information
   - Screenshots or recordings of the problem
3. **Contact support**:
   - In-app chat (fastest response)
   - Email: support@streamverse.io
   - Enterprise: Dedicated support channel

### What are the StreamVerse service level agreements (SLAs)?

| Plan | Uptime SLA | Support Response | Dedicated Support |
|------|------------|------------------|-------------------|
| Starter | 99.5% | 48 hours | No |
| Business | 99.9% | 4 hours | No |
| Enterprise | 99.99% | 1 hour | Yes |

Uptime is measured monthly. Credits are issued for SLA violations.

---

## Billing & Plans

### How does pricing work?

StreamVerse offers usage-based and fixed pricing:

**Starter (Free tier)**:
- 100 streaming hours/month
- Basic analytics
- Community support

**Business ($99/month)**:
- 500 streaming hours/month
- Advanced analytics
- Priority support
- Custom branding

**Enterprise (Custom)**:
- Unlimited streaming
- Full analytics suite
- Dedicated support
- SLA guarantees
- Custom integrations

Additional streaming hours: $0.50/hour (Starter), $0.25/hour (Business)

### What counts as a streaming hour?

A streaming hour is calculated as:
```
Streaming Hours = Stream Duration × Number of Viewers / 100
```

For example:
- 2-hour stream with 50 viewers = 1 streaming hour
- 1-hour stream with 1000 viewers = 10 streaming hours

Encoding and storage are billed separately for Enterprise plans.

### How do I upgrade my plan?

1. Go to Account Settings > Billing
2. Select your new plan
3. Enter payment information if required
4. Confirm upgrade

Upgrades take effect immediately. You'll be prorated for the remainder of the billing cycle.

---

## Security & Compliance

### Is my content secure?

StreamVerse implements multiple security layers:
- **Encryption in transit**: TLS 1.3 for all connections
- **Encryption at rest**: AES-256 for stored content
- **Stream key protection**: Keys are hashed and never displayed after creation
- **Access controls**: Role-based permissions for team members
- **DRM support**: Widevine and FairPlay for Enterprise plans

### Is StreamVerse GDPR compliant?

Yes. StreamVerse is fully GDPR compliant:
- Data processing agreements available
- EU data residency option (Enterprise)
- Viewer data anonymization
- Right to erasure support
- Cookie consent management

### Can I restrict who views my streams?

Yes, access control options include:
- **Public**: Anyone can view
- **Unlisted**: Only those with the link
- **Password protected**: Requires password to view
- **Domain restriction**: Embed only on approved domains
- **Geographic restriction**: Block or allow specific countries
- **Token authentication**: API-based access control (Enterprise)

---

## Integration & API

### How do I embed streams on my website?

Use the StreamVerse embed code:
```html
<iframe 
  src="https://player.streamverse.io/embed/{channelId}"
  width="640"
  height="360"
  frameborder="0"
  allowfullscreen>
</iframe>
```

Or use the JavaScript Player SDK for more control:
```html
<script src="https://player.streamverse.io/sdk/v2.js"></script>
<script>
  const player = new StreamVersePlayer('player-container', {
    channelId: 'ch_001',
    autoplay: true,
    muted: true
  });
</script>
```

### What webhooks are available?

StreamVerse can send webhooks for:
- `stream.started` - Stream went live
- `stream.ended` - Stream ended
- `broadcast.created` - New broadcast created
- `broadcast.updated` - Broadcast metadata changed
- `recording.ready` - VOD processing complete
- `viewer.milestone` - Viewer count milestone reached
- `alert.triggered` - System alert triggered

Configure webhooks in Developer Settings > Webhooks.

### Do you have SDKs?

Official SDKs are available for:
- **JavaScript/TypeScript**: `npm install @streamverse/sdk`
- **Python**: `pip install streamverse`
- **Go**: `go get github.com/streamverse/go-sdk`
- **Ruby**: `gem install streamverse`
- **PHP**: `composer require streamverse/sdk`

Community SDKs exist for Rust, Java, and .NET.