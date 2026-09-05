const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const handler = require('../api/index');

function invoke(method, url, headers = {}) {
  const responseHeaders = {};
  const response = {
    headers: responseHeaders,
    headersSent: false,
    setHeader(name, value) {
      responseHeaders[name.toLowerCase()] = value;
    },
    end(body = '') {
      this.body = body;
      this.headersSent = true;
    },
  };

  return handler({ method, url, headers }, response).then(() => response);
}

test('rejects missing and unsupported targets', async () => {
  assert.equal((await invoke('GET', '/api')).statusCode, 400);
  assert.equal((await invoke('GET', '/api?url=ftp%3A%2F%2Fexample.com')).statusCode, 400);
  assert.equal((await invoke('POST', '/api?url=https%3A%2F%2Fexample.com')).statusCode, 405);
});

test('proxies the body, selected headers, and user agent', async (t) => {
  const server = http.createServer((req, res) => {
    assert.equal(req.headers['user-agent'], 'test-client');
    res.writeHead(200, {
      'content-type': 'application/yaml',
      'subscription-userinfo': 'upload=1; download=2; total=3; expire=4',
      'x-private-header': 'not forwarded',
    });
    res.end('proxy body');
  });
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const target = `http://127.0.0.1:${server.address().port}/subscription`;
  const response = await invoke('GET', `/api?ua=test-client&url=${encodeURIComponent(target)}`);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.toString(), 'proxy body');
  assert.equal(response.headers['content-type'], 'application/yaml');
  assert.match(response.headers['subscription-userinfo'], /download=2/);
  assert.equal(response.headers['x-private-header'], undefined);
});