const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(cors());
app.use(express.json());

/**
 * Find the closest label/header text for a given form field element.
 * Checks (in order): explicit <label for="">, wrapping <label>, preceding
 * sibling text/label, nearest ancestor heading (h1-h6), fieldset <legend>.
 */
function findFieldHeader($, el) {
  const id = $(el).attr('id');

  // 1. Explicit <label for="id">
  if (id) {
    const label = $(`label[for="${id}"]`).first().text().trim();
    if (label) return label;
  }

  // 2. Wrapping <label>
  const parentLabel = $(el).closest('label').text().trim();
  if (parentLabel) {
    // Strip the field's own value from the label text to get only the header
    const val = $(el).val() || '';
    return parentLabel.replace(val, '').trim() || parentLabel;
  }

  // 3. Immediately preceding sibling that is a label or carries text
  let prev = $(el).prev();
  while (prev.length) {
    const tag = prev.prop('tagName') ? prev.prop('tagName').toLowerCase() : '';
    const text = prev.text().trim();
    if (tag === 'label' && text) return text;
    if (/^(p|span|div|td|th|dt|strong|b|em|li)$/.test(tag) && text) return text;
    prev = prev.prev();
  }

  // 4. Parent cell sibling (table layout: <td>Header</td><td><input></td>)
  const parentCell = $(el).closest('td, th');
  if (parentCell.length) {
    const prevCell = parentCell.prev('td, th');
    if (prevCell.length && prevCell.text().trim()) return prevCell.text().trim();
  }

  // 5. Nearest ancestor heading (h1–h6)
  const headingText = $(el)
    .parents()
    .map((_, p) => {
      const heading = $(p).find('h1,h2,h3,h4,h5,h6').first();
      return heading.length ? heading.text().trim() : null;
    })
    .get()
    .filter(Boolean)[0];
  if (headingText) return headingText;

  // 6. Fieldset legend
  const legend = $(el).closest('fieldset').find('legend').first().text().trim();
  if (legend) return legend;

  // 7. Placeholder / name / id as fallback
  return (
    $(el).attr('placeholder') ||
    $(el).attr('name') ||
    $(el).attr('id') ||
    '(no header)'
  );
}

/**
 * Extract all meaningful form fields from the HTML of a page.
 */
function extractFields($) {
  const results = [];

  // --- inputs (text, number, email, tel, url, hidden, password, date, …) ---
  $('input').each((_, el) => {
    const type = ($(el).attr('type') || 'text').toLowerCase();
    if (['submit', 'button', 'reset', 'image'].includes(type)) return;

    if (type === 'checkbox' || type === 'radio') {
      results.push({
        type,
        header: findFieldHeader($, el),
        name: $(el).attr('name') || '',
        value: $(el).attr('value') || '',
        checked: $(el).prop('checked') || $(el).attr('checked') === 'checked',
      });
      return;
    }

    results.push({
      type,
      header: findFieldHeader($, el),
      name: $(el).attr('name') || $(el).attr('id') || '',
      value: $(el).attr('value') || '',
    });
  });

  // --- textareas ---
  $('textarea').each((_, el) => {
    results.push({
      type: 'textarea',
      header: findFieldHeader($, el),
      name: $(el).attr('name') || $(el).attr('id') || '',
      value: $(el).text().trim(),
    });
  });

  // --- selects (including select2 / chosen) ---
  $('select').each((_, el) => {
    const options = [];
    $(el)
      .find('option')
      .each((_, opt) => {
        options.push({
          value: $(opt).attr('value') || $(opt).text().trim(),
          text: $(opt).text().trim(),
          selected:
            $(opt).prop('selected') ||
            $(opt).attr('selected') === 'selected',
        });
      });

    const selected = options.filter((o) => o.selected).map((o) => o.text);

    results.push({
      type: 'select',
      header: findFieldHeader($, el),
      name: $(el).attr('name') || $(el).attr('id') || '',
      selectedValues: selected,
      options,
    });
  });

  return results;
}

// POST /extract
// Body: { prefix: string, suffixes: string[] }
app.post('/extract', async (req, res) => {
  const { prefix, suffixes } = req.body;

  if (!prefix || !Array.isArray(suffixes) || suffixes.length === 0) {
    return res
      .status(400)
      .json({ error: 'prefix (string) and suffixes (array) are required.' });
  }

  const urlResults = await Promise.all(
    suffixes.map(async (suffix) => {
      const url = `${prefix.replace(/\/$/, '')}/${suffix.replace(/^\//, '')}`;
      try {
        const { data: html } = await axios.get(url, {
          timeout: 15000,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; HtmlExtractor/1.0)',
            Accept: 'text/html,application/xhtml+xml',
          },
          responseType: 'text',
        });

        const $ = cheerio.load(html);
        const fields = extractFields($);
        console.log(fields);
        
        return { url, success: true, fields };
      } catch (err) {
        return {
          url,
          success: false,
          error: err.message,
          fields: [],
        };
      }
    })
  );

  res.json({ results: urlResults });
});

// GET /health
app.get('/health', (_, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
