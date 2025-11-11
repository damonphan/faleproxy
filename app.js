// app.js
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware to parse request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Yale → Fale transformation ---------------------------------

/**
 * Replace "Yale" only when it appears as part of an institution name,
 * and preserve the case pattern:
 *   YALE University   -> FALE University
 *   Yale College      -> Fale College
 *   yale medical ...  -> fale medical ...
 */
function transformText(text) {
  return text.replace(
    /\b(yale)\b(?=\s+(University|College|medical school))/gi,
    (match) => {
      if (match === match.toUpperCase()) {
        // YALE
        return 'FALE';
      }

      if (
        match[0] === match[0].toUpperCase() &&
        match.slice(1) === match.slice(1).toLowerCase()
      ) {
        // Yale
        return 'Fale';
      }

      // yale (all lower)
      return 'fale';
    }
  );
}

/**
 * Apply the Yale→Fale transformation to the HTML document:
 *  - only text nodes (not attributes/URLs)
 *  - <title> and <body> content
 */
function transformHtml(html) {
  const $ = cheerio.load(html);

  // Transform text nodes in <body>
  $('body *')
    .contents()
    .filter(function () {
      return this.nodeType === 3; // text node
    })
    .each(function () {
      const original = $(this).text();
      const updated = transformText(original);
      if (original !== updated) {
        $(this).replaceWith(updated);
      }
    });

  // Transform <title>
  const origTitle = $('title').text();
  const newTitle = transformText(origTitle);
  $('title').text(newTitle);

  return {
    html: $.html(),
    title: newTitle,
  };
}

// Routes --------------------------------------------------------------

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to fetch and modify content
app.post('/fetch', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Fetch the content from the provided URL
    const response = await axios.get(url);
    const html = response.data;

    // Transform the HTML
    const { html: modifiedHtml, title } = transformHtml(html);

    return res.json({
      success: true,
      content: modifiedHtml,
      title,
      originalUrl: url,
    });
  } catch (error) {
    console.error('Error fetching URL:', error.message);
    return res.status(500).json({
      error: `Failed to fetch content: ${error.message}`,
    });
  }
});

// Export app for tests; only listen if run directly -------------------
module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Faleproxy server running at http://localhost:${PORT}`);
  });
}
