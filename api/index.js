const DEFAULT_USER_AGENT = 'clash-verge/v2.4.3';
const REQUEST_TIMEOUT_MS = 20000;

const PASS_THROUGH_RESPONSE_HEADERS = [
  'subscription-userinfo',
  'profile-update-interval',
  'profile-title',
  'profile-web-page-url',
  'content-disposition',
  'content-type',
  'cache-control',
];

function createCorsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,HEAD,OPTIONS',
    'access-control-allow-headers': 'content-type,user-agent,x-user-agent',
    'access-control-expose-headers': PASS_THROUGH_RESPONSE_HEADERS.join(', '),
  };
}

function applyHeaders(res, headers) {
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
}

function sanitizeHeaderValue(value) {
  return String(value || '').replace(/[\r\n]/g, '').trim();
}

function getUpstreamUserAgent(req, requestUrl) {
  return sanitizeHeaderValue(
    requestUrl.searchParams.get('ua') ||
      req.headers['x-user-agent'] ||
      req.headers['user-agent'] ||
      DEFAULT_USER_AGENT
  );
}

function sendText(res, statusCode, message) {
  applyHeaders(res, createCorsHeaders());
  res.statusCode = statusCode;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.end(message);
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    applyHeaders(res, createCorsHeaders());
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!['GET', 'HEAD'].includes(req.method)) {
    sendText(res, 405, 'Method Not Allowed');
    return;
  }

  const requestUrl = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const targetUrl = requestUrl.searchParams.get('url');

  if (!targetUrl) {
    sendText(res, 400, 'Missing URL');
    return;
  }

  let parsedTarget;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    sendText(res, 400, 'Invalid URL');
    return;
  }

  if (!['http:', 'https:'].includes(parsedTarget.protocol)) {
    sendText(res, 400, 'Only http/https URLs are allowed');
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(parsedTarget.toString(), {
      method: req.method,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': getUpstreamUserAgent(req, requestUrl),
        accept: '*/*',
      },
    });
  } catch (error) {
    const message = error.name === 'AbortError' ? 'Upstream request timed out' : 'Unable to fetch upstream URL';
    sendText(res, 502, message);
    return;
  } finally {
    clearTimeout(timeout);
  }

  const responseHeaders = createCorsHeaders();
  for (const headerName of PASS_THROUGH_RESPONSE_HEADERS) {
    const value = upstreamResponse.headers.get(headerName);
    if (value) responseHeaders[headerName] = value;
  }

  if (!responseHeaders['content-type']) {
    responseHeaders['content-type'] = 'text/plain; charset=utf-8';
  }

  applyHeaders(res, responseHeaders);
  res.statusCode = upstreamResponse.status;

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  try {
    res.end(Buffer.from(await upstreamResponse.arrayBuffer()));
  } catch {
    if (!res.headersSent) sendText(res, 502, 'Unable to read upstream response');
  }
};
