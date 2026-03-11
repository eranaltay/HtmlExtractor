require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const { createRequestLimiter } = require('./requestLimiter');

const app = express();
const PORT = process.env.PORT || 3001;

// Throttling / circuit-breaker configuration (env-based)
const REQUEST_THROTTLING_ENABLED =
  String(process.env.REQUEST_THROTTLING_ENABLED || 'false').toLowerCase() ===
  'true';

const REQUEST_MAX_CONCURRENCY = Number(
  process.env.REQUEST_MAX_CONCURRENCY || '2'
);
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || '2000');
const REQUEST_BACKOFF_BASE_MS = Number(
  process.env.REQUEST_BACKOFF_BASE_MS || '1000'
);
const REQUEST_BACKOFF_FACTOR = Number(
  process.env.REQUEST_BACKOFF_FACTOR || '2.0'
);
const REQUEST_CIRCUIT_FAILURE_THRESHOLD = Number(
  process.env.REQUEST_CIRCUIT_FAILURE_THRESHOLD || '5'
);
const REQUEST_CIRCUIT_OPEN_MS = Number(
  process.env.REQUEST_CIRCUIT_OPEN_MS || '60000'
);

const requestLimiter = createRequestLimiter({
  enabled: REQUEST_THROTTLING_ENABLED,
  maxConcurrency: REQUEST_MAX_CONCURRENCY,
  delayMs: REQUEST_DELAY_MS,
  backoffBaseMs: REQUEST_BACKOFF_BASE_MS,
  backoffFactor: REQUEST_BACKOFF_FACTOR,
  failureThreshold: REQUEST_CIRCUIT_FAILURE_THRESHOLD,
  circuitOpenMs: REQUEST_CIRCUIT_OPEN_MS,
});

app.use(cors());
app.use(express.json());

/**
 * Find the closest meaningful header/label for a form field.
 * Priority: explicit <label for>, wrapping <label>, aria-label,
 * preceding sibling text, parent's preceding sibling text, placeholder, name.
 */
function findFieldHeader($, element) {

  const $el = $(element);
  const id = $el.attr('id');

  // 1. Explicit <label for="id">
  if (id) {
    // In Node.js there is no global CSS.escape, so we avoid using it
    const safeId = String(id).replace(/"/g, '\\"');
    const labelText = $(`label[for="${safeId}"]`).first().text().trim();
    if (labelText) return labelText;
  }

  // 2. Wrapped inside a <label>
  const $parentLabel = $el.closest('label');
  if ($parentLabel.length) {
    // Return the label text excluding the input's own text
    const clone = $parentLabel.clone();
    clone.find('input, textarea, select').remove();
    const txt = clone.text().trim();
    if (txt) return txt;
  }

  // 3. aria-label / aria-labelledby
  const ariaLabel = $el.attr('aria-label');
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

  const labelledBy = $el.attr('aria-labelledby');
  if (labelledBy) {
    const refText = $(`#${labelledBy}`).first().text().trim();
    if (refText) return refText;
  }

  // 4. Preceding siblings (label, th, span, p, div, headings)
  const LABEL_SELECTORS = 'label, h1, h2, h3, h4, h5, h6, th, legend, p, span, div';
  const prevSib = $el.prevAll(LABEL_SELECTORS).first().text().trim();
  if (prevSib) return prevSib;

  // 5. Parent's preceding sibling
  const parentPrevSib = $el.parent().prevAll(LABEL_SELECTORS).first().text().trim();
  if (parentPrevSib) return parentPrevSib;

  // 6. Closest ancestor td/th label
  const $td = $el.closest('td');
  if ($td.length) {
    const $th = $td.prevAll('th').first();
    if ($th.length) return $th.text().trim();
    // check corresponding <th> in header row by column index
    const colIndex = $td.index();
    const $table = $td.closest('table');
    const headerCell = $table.find('thead tr th, tr th').eq(colIndex).text().trim();
    if (headerCell) return headerCell;
  }

  // 7. Fallback: placeholder or name attribute
  return $el.attr('placeholder') || $el.attr('name') || '';
}

/**
 * Get the display value of a form field.
 */
function getFieldValue($, element) {
  const $el = $(element);
  const tag = (element.tagName || element.name || '').toLowerCase();
  const type = ($el.attr('type') || '').toLowerCase();

  if (tag === 'textarea') {
    return $el.text().trim() || $el.val() || '';
  }

  if (tag === 'select') {
    const selectedOptions = $el.find('option').filter((_, opt) => {
      const $opt = $(opt);
      return $opt.prop('selected') || $opt.attr('selected') !== undefined;
    });

    if (selectedOptions.length) {
      const texts = selectedOptions
        .map((_, opt) => $(opt).text().trim())
        .get()
        .filter((t) => t);
      return texts.join(', ');
    }

    const firstOptionText = $el.find('option').first().text().trim();
    return firstOptionText || '';
  }

  if (type === 'checkbox' || type === 'radio') {
    return $el.attr('checked') !== undefined ? 'checked' : 'unchecked';
  }

  return $el.attr('value') || '';
}

/**
 * Extract all form fields from the HTML with their headers and values.
 */
function extractFields(html) {
  const $ = cheerio.load(html);
  const fields = [];

  const FIELD_SELECTOR = 'input:not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]):not([type="hidden"]), textarea, select';

  $(FIELD_SELECTOR).each((_, element) => {
    const $el = $(element);
    const tag = (element.tagName || element.name || '').toLowerCase();
    const type = ($el.attr('type') || tag).toLowerCase();

    const header = findFieldHeader($, element);
    const value = getFieldValue($, element);
    const name = $el.attr('name') || $el.attr('id') || '';

    fields.push({ header, name, type, value });
  });

  return fields;
}

// POST /api/extract
app.post('/api/extract', async (req, res) => {



  const { urlPrefix, suffixes } = req.body;

  if (!urlPrefix || !Array.isArray(suffixes) || suffixes.length === 0) {
    return res.status(400).json({ error: 'urlPrefix and a non-empty suffixes array are required.' });
  }

  const results = [];

  const tasks = suffixes
    .map((suffix) => suffix.trim())
    .filter(Boolean)
    .map((trimmed) => {
      const url =
        urlPrefix.replace(/\/+$/, '') + '/' + trimmed.replace(/^\/+/, '');

      const run = async () => {
        try {
          const response = await axios.get(url, {
            timeout: 15000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; HtmlExtractor/1.0)',
              Accept: 'text/html,application/xhtml+xml',
              'Accept-Language': 'he,en;q=0.9',
            },
            // Follow redirects
            maxRedirects: 5,
            // Treat all 2xx + 3xx as success
            validateStatus: (status) => status < 400,
          });

          const fields = extractFields(response.data);

          results.push({ url, status: 'ok', fields });
        } catch (err) {
          const message = err.response
            ? `HTTP ${err.response.status}`
            : err.message;
          results.push({ url, status: 'error', error: message, fields: [] });
        }
      };

      if (REQUEST_THROTTLING_ENABLED) {
        return requestLimiter.schedule(url, run);
      }

      return run();
    });

  // Wait for all fetches to complete (sequentially or via limiter)
  await Promise.allSettled(tasks);

  res.json({ results });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
