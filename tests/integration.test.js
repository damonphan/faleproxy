// tests/integration.test.js
const axios = require('axios');
const cheerio = require('cheerio');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { sampleHtmlWithYale } = require('./test-utils');
const nock = require('nock');

const TEST_PORT = 3099;
let server;

describe('Integration Tests', () => {
  beforeAll(async () => {
    // Block external HTTP but allow our local test server
    nock.disableNetConnect();
    nock.enableNetConnect('localhost');

    // Copy app.js to a temporary test file and change the port
    await execAsync('cp app.js app.test.js');
    await execAsync(`sed -i '' 's/const PORT = 3001/const PORT = ${TEST_PORT}/' app.test.js`);

    // Start the test server
    server = require('child_process').spawn('node', ['app.test.js'], {
      detached: true,
      stdio: 'ignore',
    });

    // Give server time to start
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }, 10000);

  afterAll(async () => {
    if (server && server.pid) {
      process.kill(-server.pid);
    }
    await execAsync('rm app.test.js');
    nock.cleanAll();
    nock.enableNetConnect();
  });

  test(
    'Should replace Yale with Fale in fetched content',
    async () => {
      // Mock external content
      nock('https://example.com').get('/').reply(200, sampleHtmlWithYale);

      const response = await axios.post(`http://localhost:${TEST_PORT}/fetch`, {
        url: 'https://example.com/',
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      const $ = cheerio.load(response.data.content);
      expect($('title').text()).toBe('Fale University Test Page');
      expect($('h1').text()).toBe('Welcome to Fale University');
      expect($('p').first().text()).toContain('Fale University is a private');

      // URLs unchanged
      const links = $('a');
      let hasYaleUrl = false;
      links.each((_, link) => {
        const href = $(link).attr('href');
        if (href && href.includes('yale.edu')) {
          hasYaleUrl = true;
        }
      });
      expect(hasYaleUrl).toBe(true);

      // Link text changed
      expect($('a').first().text()).toBe('About Fale');
    },
    10000
  );

  test('Should handle invalid URLs', async () => {
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, {
        url: 'not-a-valid-url',
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response?.status).toBe(500);
    }
  });

  test('Should handle missing URL parameter', async () => {
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, {});
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response?.status).toBe(400);
      expect(error.response?.data?.error).toBe('URL is required');
    }
  });
});
