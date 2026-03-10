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
