# StreamVault Platform Policies and Guidelines

This document outlines the policies, guidelines, and best practices for content creators and broadcasters on the StreamVault platform.

---

## Content Policies

### Prohibited Content

The following content types are strictly prohibited on StreamVault:

1. **Violence and Harmful Content**
   - Graphic violence or gore
   - Content promoting self-harm or dangerous activities
   - Threats or incitement of violence

2. **Hateful Content**
   - Discrimination based on race, ethnicity, religion, gender, or sexual orientation
   - Hate speech or symbols
   - Harassment or bullying

3. **Adult Content**
   - Explicit sexual content (unless on age-restricted channels)
   - Nudity not meeting artistic or educational exceptions
   - Sexual exploitation

4. **Illegal Activities**
   - Content promoting illegal substances
   - Gambling without proper licensing
   - Copyright infringement
   - Fraud or scams

5. **Misinformation**
   - False medical advice
   - Election misinformation
   - Dangerous conspiracy theories

### Age-Restricted Content

Some content may be permitted but requires age verification:
- Mature gaming content
- Alcohol or tobacco-related content
- Discussions of adult themes

Age-restricted broadcasts are marked with an `ageRestricted: true` flag and require viewer verification.

---

## Broadcasting Guidelines

### Technical Requirements

#### Minimum Stream Quality
| Tier | Resolution | Bitrate | FPS |
|------|------------|---------|-----|
| Basic | 720p | 2,500 kbps | 30 |
| Standard | 1080p | 5,000 kbps | 30 |
| Premium | 1080p | 6,000 kbps | 60 |
| Ultra | 4K | 15,000 kbps | 60 |

#### Audio Requirements
- Minimum bitrate: 128 kbps
- Recommended bitrate: 320 kbps
- Supported codecs: AAC, Opus
- Sample rates: 44.1 kHz or 48 kHz

### Pre-Broadcast Checklist

Before going live, broadcasters must:

1. **Test Stream Connection**
   - Run connection test via API: `POST /api/streams/test-connection`
   - Verify latency is under 200ms
   - Confirm no packet loss

2. **Verify Stream Health**
   - Buffer health > 90%
   - Dropped frames < 0.1%
   - Network jitter < 2ms

3. **Content Preparation**
   - Set appropriate title and description
   - Add relevant tags for discoverability
   - Configure age restrictions if needed
   - Set correct language and region

4. **Technical Setup**
   - Confirm audio levels (-12 to -6 dB recommended)
   - Test video quality at target resolution
   - Verify backup internet connection (for premium partners)

### During Broadcast

#### Monitoring Requirements

Broadcasters should monitor:
- Viewer count trends (available via `/api/analytics/broadcasts/{id}/viewers/realtime`)
- Stream health metrics (via `/api/streams/{streamId}/health`)
- Active alerts (via `/api/broadcasts/{broadcastId}/alerts`)

#### Response Times for Issues

| Alert Severity | Required Response Time |
|----------------|----------------------|
| Critical | Immediate (< 1 minute) |
| Warning | Within 5 minutes |
| Info | Acknowledgment within broadcast |

#### Chat Moderation

- Channels must have active moderation during live broadcasts
- Auto-moderation must be enabled for channels with 1,000+ average viewers
- Response to reported content: within 2 minutes

### Post-Broadcast

1. **VOD Processing**
   - Recordings are automatically created for eligible broadcasts
   - Processing time: approximately 2x broadcast duration
   - Minimum broadcast length for VOD: 5 minutes

2. **Analytics Review**
   - Review performance via `/api/analytics/broadcasts/{id}`
   - Compare with previous broadcasts
   - Document any technical issues

---

## Partner Program Requirements

### Affiliate Tier

**Requirements:**
- 50+ average concurrent viewers
- 500+ followers
- 25+ hours streamed in last 30 days
- Minimum 7 unique broadcast days in last 30 days

**Benefits:**
- Revenue sharing: 50%
- Custom emotes: 5
- VOD storage: 14 days
- Transcoding: Up to 720p
- Support response: 48 hours

### Partner Tier

**Requirements:**
- 500+ average concurrent viewers
- 5,000+ followers
- 50+ hours streamed in last 30 days
- Consistent schedule (minimum 3 days/week)

**Benefits:**
- Revenue sharing: 60%
- Custom emotes: 25
- VOD storage: 60 days
- Transcoding: Up to 1080p60
- Support response: 24 hours
- Custom channel URL
- Verified badge

### Premium Partner Tier

**Requirements:**
- 5,000+ average concurrent viewers
- 50,000+ followers
- Exclusive content agreement
- Professional production quality

**Benefits:**
- Revenue sharing: 70%
- Custom emotes: Unlimited
- VOD storage: Unlimited
- Transcoding: Up to 4K60
- Support response: 4 hours
- Dedicated partner manager
- Featured placement
- Priority CDN routing
- Custom API rate limits

---

## API Usage Guidelines

### Rate Limits

| Endpoint Category | Requests/Minute | Burst Limit |
|-------------------|-----------------|-------------|
| Health checks | 120 | 20 |
| Read operations | 60 | 10 |
| Write operations | 30 | 5 |
| Analytics queries | 30 | 5 |
| Stream operations | 10 | 2 |

### Best Practices

1. **Caching**
   - Cache non-real-time data for at least 30 seconds
   - Use ETags for conditional requests
   - Implement exponential backoff on failures

2. **Polling Frequencies**
   - Real-time viewers: Maximum every 5 seconds
   - Stream health: Maximum every 10 seconds
   - Analytics: Maximum every 30 seconds
   - Alerts: Maximum every 15 seconds

3. **Error Handling**
   - Always handle 404, 400, and 500 responses
   - Implement retry logic with backoff
   - Log errors for debugging

4. **Authentication**
   - Rotate API keys every 90 days
   - Never expose keys in client-side code
   - Use environment variables for key storage

---

## Revenue and Monetization

### Subscription Tiers

| Tier | Monthly Price | Revenue Share | Benefits |
|------|--------------|---------------|----------|
| Tier 1 | $4.99 | 50/50 | Ad-free, emotes, badge |
| Tier 2 | $9.99 | 50/50 | + Exclusive content |
| Tier 3 | $24.99 | 50/50 | + Direct messaging |

### Advertising

- Pre-roll ads: 15-30 seconds
- Mid-roll ads: Minimum 10 minutes between
- Maximum ad density: 3 minutes per hour
- Ad-free for subscribers

### Donations and Tips

- Platform fee: 2.5% + payment processing
- Minimum donation: $1.00
- Maximum donation: $500 per transaction
- Animated alerts for donations > $5

### Sponsorship Guidelines

- Sponsored content must be disclosed
- Use `sponsored: true` tag on broadcasts
- Verbal disclosure within first 5 minutes
- No competing platform promotion

---

## Copyright and DMCA

### Music Usage

**Licensed Music Categories:**
- StreamVault Music Library (royalty-free)
- Licensed partner catalogs
- Original creator content

**Restricted:**
- Commercial music without license
- Movie/TV soundtracks
- Video game music (check individual licenses)

### DMCA Strike System

| Strikes | Consequence |
|---------|-------------|
| 1st Strike | Warning, content removed |
| 2nd Strike | 7-day streaming restriction |
| 3rd Strike | Account suspension pending review |

### Counter-Notification

Creators may submit counter-notifications if they believe content was wrongly flagged:
1. Submit via StreamVault Creator Dashboard
2. Provide proof of ownership or license
3. Response within 10-14 business days

---

## Safety and Security

### Account Security

**Required for Partners:**
- Two-factor authentication
- Unique, strong password
- Regular security reviews

**Recommended:**
- Hardware security keys
- Login notifications enabled
- Trusted device management

### Stream Key Security

- Stream keys should never be shared
- Regenerate keys if compromised
- Keys can be regenerated via `/api/channels/{id}/regenerate-key`

### Viewer Safety

- Block and ban tools available
- Channel-specific banned word lists
- Slow mode for high-traffic chats
- Follower-only mode option

---

## Compliance and Reporting

### Required Disclosures

Broadcasters must disclose:
- Sponsored content
- Affiliate links
- Paid promotions
- Material connections to products

### Data Retention

| Data Type | Retention Period |
|-----------|-----------------|
| Stream analytics | 2 years |
| Chat logs | 90 days |
| VOD content | Based on tier |
| Account data | Duration of account + 30 days |

### Reporting Violations

To report policy violations:
1. Use in-app reporting tools
2. Email: abuse@streamvault.io
3. API: `POST /api/reports` (for automated systems)

Response times:
- Immediate harm: < 1 hour
- General violations: < 24 hours
- Appeals: 3-5 business days

---

## Updates and Changes

Policy updates are announced:
- 30 days in advance for major changes
- 7 days in advance for minor changes
- Immediately for legal or safety requirements

Last updated: January 2024
Version: 2.4.1