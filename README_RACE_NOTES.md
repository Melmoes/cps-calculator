
# Race-condition hardening for CPS app

This update adds `assets/safe-api.js` and includes it from `assets/index.html`. It provides a `window.safeApi.safeUpdate()` wrapper
that debounces, queues, and retries writes to the Zendesk Tickets API to avoid the classic:
> Ticket 'X' not saved — A change was made to this ticket as your update was being saved.

## How to use

Wrap any WRITE to the Zendesk API (e.g., priority/status/custom_fields edits) like this:

```js
// BEFORE
await fetch(url, { method: 'PUT', headers, body: JSON.stringify({ ticket }) })

// AFTER
await window.safeApi.safeUpdate(() => 
  fetch(url, { method: 'PUT', headers, body: JSON.stringify({ ticket }) }),
  {
    key: 'update:priority',   // unique logical key per type of write
    preWaitMs: 1200,          // give Zendesk a moment to persist the agent's submit
    debounceMs: 800,          // coalesce rapid same-key writes
    retries: 3                // retry on 409/429/5xx or 'not saved' text
  }
)
```

If you trigger multiple writes in rapid succession (e.g., user changes a field that changes CPS, which changes priority),
give each a different key, or better, funnel them into one combined write.

## What it does

- **Debounce**: multiple calls with the same `key` within `debounceMs` collapse into a single API call.
- **Queue**: writes are serialized, one at a time, to avoid concurrent PUTs.
- **Pre-wait**: small, configurable delay before attempting the PUT to let the agent's submit settle.
- **Retry**: exponential backoff with jitter on 409 (conflict), 429 (rate), 408/5xx, or when the response text matches
  "Ticket not saved / a change was made".
