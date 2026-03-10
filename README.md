# HTML Field Extractor

A small React + Node.js app that fetches web pages and extracts form field values (input, textarea, checkbox, select/dropdown) along with their closest header/label.

## Features

- Enter a **URL prefix** and a list of **URL suffixes** (one per line)
- Fetches each constructed URL server-side (avoids CORS issues)
- Extracts all form fields: `input`, `textarea`, `select`, `checkbox`, `radio`
- Finds the **closest label/header** for each field using multiple strategies:
  - `<label for="id">` association
  - Wrapping `<label>` element
  - `aria-label` / `aria-labelledby`
  - Preceding sibling headings/labels
  - Table `<th>` column headers
- Supports **Hebrew**, **English**, and **numeric** field values
- RTL text is rendered correctly in the results table
- Export results to **Excel (.xlsx)** with a pivot layout (one row per URL, columns per field header)

## Request throttling & circuit breaker

The backend can optionally throttle outbound requests and protect target endpoints using a simple **per-host rate limiter + circuit breaker**. This is controlled entirely via environment variables.

When disabled (default), the server behaves as before and will fetch all URLs as quickly as Node/axios allow.

### Environment variables

- **`REQUEST_THROTTLING_ENABLED`** (default: `false`)
  - Set to `true` to enable throttling and the circuit breaker.
- **`REQUEST_MAX_CONCURRENCY`** (default: `2`)
  - Maximum number of active outbound requests at a time (across all hosts).
- **`REQUEST_DELAY_MS`** (default: `500`)
  - Minimum delay (in ms) between starting requests to the **same host**.
- **`REQUEST_BACKOFF_BASE_MS`** (default: `1000`)
  - Base backoff delay (in ms) applied when requests to a host start failing.
- **`REQUEST_BACKOFF_FACTOR`** (default: `2.0`)
  - Exponential backoff factor. Each consecutive failure increases the delay by this factor (capped to 30 seconds).
- **`REQUEST_CIRCUIT_FAILURE_THRESHOLD`** (default: `5`)
  - Number of consecutive failures for a host before its circuit is opened.
- **`REQUEST_CIRCUIT_OPEN_MS`** (default: `60000`)
  - How long (in ms) a host’s circuit remains open (requests are short-circuited) before a test request is allowed.

Throttling and breaker state are tracked **per host** (derived from the target URL), so an unhealthy host will not slow down or block requests to other hosts.

### Example configurations

**No throttling (default)**

```bash
REQUEST_THROTTLING_ENABLED=false
```

**Simple “safe mode” (sequential with delay)**

```bash
REQUEST_THROTTLING_ENABLED=true
REQUEST_MAX_CONCURRENCY=1
REQUEST_DELAY_MS=1000
```

This will fetch one URL at a time with at least 1 second between requests to the same host.

**Concurrent with circuit breaker and backoff**

```bash
REQUEST_THROTTLING_ENABLED=true
REQUEST_MAX_CONCURRENCY=2
REQUEST_DELAY_MS=500
REQUEST_BACKOFF_BASE_MS=1000
REQUEST_BACKOFF_FACTOR=2.0
REQUEST_CIRCUIT_FAILURE_THRESHOLD=3
REQUEST_CIRCUIT_OPEN_MS=120000
```

In this mode:

- Up to 2 requests can be in-flight concurrently.
- Requests to the same host are spaced by at least 500ms.
- If a host starts failing, backoff delays grow exponentially (1s, 2s, 4s, … capped at 30s).
- After 3 consecutive failures, the host’s circuit opens for 2 minutes; requests to that host will fail fast during that period.

## Project Structure

```
HtmlExtractor/
├── backend/          # Express server + cheerio HTML parser
│   └── index.js
└── frontend/         # React + Vite UI
    └── src/App.jsx
```

## Getting Started

```bash
# Install all dependencies
npm run install:all

# Run both dev servers (backend :3001, frontend :5173)
npm run dev
```

Then open **http://localhost:5173**.

### Example

- **URL Prefix:** `https://example.com`
- **Suffixes:**
  ```
  /contact
  /register
  ```

The app will fetch `https://example.com/contact` and `https://example.com/register`, then display all form fields with their labels and current values.
