# Bureau Agent Integration

**Connect your agents to Bureau** to automatically track costs, views, and performance.

---

## Quick Start

### 1. Get Your Token

Go to **Settings → Tokens** in Bureau and create a new ingest token:

```
Token name: My Agent
Scope: All streams (or pick one)
```

You'll get a token like: `bureau_a1b2c3d4...`

**Keep this secret!** Don't commit it to git.

### 2. Send Data from Your Agent

POST to `https://bureau.yourdomain.com/api/ingest` with Bearer auth:

```bash
curl -X POST https://bureau.yourdomain.com/api/ingest \
  -H "Authorization: Bearer bureau_a1b2c3d4..." \
  -H "Content-Type: application/json" \
  -d '{
    "type": "intake",
    "stream": "ember",
    "content": "Published Ep13 Short: 34 views in first day, $31.42 generation cost",
    "metadata": {
      "output_id": "ep13",
      "cost_usd": 31.42,
      "views": 34
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "ingest_id": "...",
  "stream_id": "...",
  "status": "received"
}
```

---

## Ingest Types

### `"type": "intake"`

General-purpose intake. Bureau logs it for manual review.

**Use for:** "Published Ep13 Short: 34 views, $31.42 cost"

```json
{
  "type": "intake",
  "stream": "ember",
  "content": "Any text description of what happened",
  "metadata": {
    "output_id": "ep13",
    "cost_usd": 31.42,
    "views": 34,
    "any_other_data": "..."
  }
}
```

### `"type": "cost"`

Auto-processed cost entry. If you include `output_id` and `cost_usd`, Bureau creates an output cost record immediately.

**Use for:** Programmatic cost tracking from ElevenLabs/Higgsfield/YouTube APIs.

```json
{
  "type": "cost",
  "stream": "ember",
  "content": "Ep13 generation complete",
  "metadata": {
    "output_id": "ep13",
    "output_name": "Ep13 Short",
    "output_type": "short",
    "cost_usd": 31.42,
    "failed_cost_usd": 0,
    "views": 34,
    "trust_level": "verified",
    "sources": ["elevenlabs-api", "youtube-api"]
  }
}
```

**Required metadata:**
- `output_id` (string): Unique identifier for this output
- `cost_usd` (number): Generation cost in USD

**Optional metadata:**
- `output_name` (string): Display name (defaults to output_id)
- `output_type` (string): episode, short, video, post, image (defaults to "unknown")
- `failed_cost_usd` (number): Failed render costs (defaults to 0)
- `views` (number): View count
- `subscribers_gained` (number)
- `revenue_usd` (number)
- `trust_level` (string): verified, declared, estimated (defaults to "declared")
- `sources` (array): Data sources like ["elevenlabs-api", "youtube-api"]
- `elevenlabs_characters` (number): Character count
- `elevenlabs_cost_usd` (number): ElevenLabs cost
- `higgsfield_credits` (number): Higgsfield credit units
- `higgsfield_cost_usd` (number): Higgsfield cost in USD

### `"type": "metric"`

Update stream metrics (followers, engagement, etc). Pending review for now.

```json
{
  "type": "metric",
  "stream": "elon",
  "content": "X account stats updated",
  "metadata": {
    "followers": 18910,
    "follower_growth": -62,
    "engagement_rate": 0.0527
  }
}
```

### `"type": "finding"`

Agent-generated insight. Pending review for now.

```json
{
  "type": "finding",
  "stream": "ember",
  "content": "Ep13 cost is 3% higher than average. Consider reviewing render settings.",
  "metadata": {
    "severity": "info"
  }
}
```

---

## Stream Matching

You can reference streams by **name** (case-insensitive) or **ID**:

```json
{
  "stream": "ember"              // ✓ Matches "Ember" stream
}

{
  "stream": "Studio · Peak Glow Up"  // ✓ Matches exact name
}

{
  "stream": "11111111-1111-1111-1111-111111111111"  // ✓ Matches by ID
}
```

If your token is scoped to a specific stream, you can omit the `stream` field.

---

## Token Scopes

**All Streams:** Token can push to any stream in the workspace.

**Single Stream:** Token can only push to one stream. The `stream` field is ignored.

---

## Error Handling

**401 Unauthorized:**
- Token is invalid or revoked
- Check your token in Bureau settings

**400 Bad Request:**
- Missing required fields (`type`, `content`)
- Check the payload structure

**500 Internal Server Error:**
- Database error
- Contact support with your `ingest_id`

---

## Rate Limits

**Current:** None (pilot phase)

**Future:** 1,000 requests/hour per token

---

## Example: ElevenLabs Cost Tracking

```python
import requests
import os

BUREAU_TOKEN = os.environ['BUREAU_TOKEN']
BUREAU_URL = 'https://bureau.yourdomain.com/api/ingest'

def track_generation(output_id, characters, cost_usd, output_type='episode'):
    response = requests.post(
        BUREAU_URL,
        headers={
            'Authorization': f'Bearer {BUREAU_TOKEN}',
            'Content-Type': 'application/json'
        },
        json={
            'type': 'cost',
            'stream': 'studio-peak-glow-up',
            'content': f'{output_id} generated: {characters} characters, ${cost_usd:.2f}',
            'metadata': {
                'output_id': output_id,
                'output_name': output_id.upper(),
                'output_type': output_type,
                'cost_usd': cost_usd,
                'elevenlabs_characters': characters,
                'elevenlabs_cost_usd': cost_usd,
                'trust_level': 'verified',
                'sources': ['elevenlabs-api']
            }
        }
    )
    
    if response.ok:
        print(f'✓ Tracked: {output_id} = ${cost_usd:.2f}')
    else:
        print(f'✗ Failed: {response.status_code} {response.text}')

# Usage
track_generation('ep06', 3842, 15.37)
```

---

## Example: YouTube View Updates

```python
def update_views(output_id, views):
    response = requests.post(
        BUREAU_URL,
        headers={
            'Authorization': f'Bearer {BUREAU_TOKEN}',
            'Content-Type': 'application/json'
        },
        json={
            'type': 'cost',  # Updates existing cost record
            'stream': 'ember',
            'content': f'{output_id}: {views} views',
            'metadata': {
                'output_id': output_id,
                'cost_usd': 0,  # Required even if updating views only
                'views': views,
                'trust_level': 'verified',
                'sources': ['youtube-api']
            }
        }
    )
    
    return response.ok

# Usage (call daily)
update_views('ep12', 49)
```

---

## Viewing Intake Logs

Go to **Settings → Intake** to see all ingested data:

- **Received:** Logged successfully
- **Pending Review:** Needs manual review
- **Processed:** Auto-processed (cost entries)
- **Error:** Failed processing (check error message)

---

## Security

- **Keep tokens secret** - they grant write access to your workspace
- **Use HTTPS** - never send tokens over HTTP
- **Rotate tokens** if compromised (revoke old, create new)
- **Scope tokens** to single streams when possible

---

## Support

Questions? Check:
- [docs/TESTABILITY.md](./TESTABILITY.md) - Full API spec
- [docs/UNIT-ECONOMICS.md](./UNIT-ECONOMICS.md) - Cost tracking details

**Problems?** File an issue with your `ingest_id` from the response.
