const DEFAULT_USER_AGENT = 'clash-verge/v2.4.3';

// MiSub 需要这些响应头来读取流量、到期时间、文件名等信息
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
    // 让浏览器调试时也能看到这些自定义响应头
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
  // 优先使用 MiSub 自动拼接到代理前缀里的 ua 参数：
  //   /api?ua=clash-verge%2Fv2.4.3&url=<encoded-subscription-url>
  // 其次兼容手动传入的 x-user-agent 请求头，最后使用默认 Clash Verge UA。
  return sanitizeHeaderValue(
    requestUrl.searchParams.get('ua') ||
    req.headers['x-user-agent'] ||
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
    sendText(res, 400, 'Miss URL');
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

  const upstreamResponse = await fetch(parsedTarget.toString(), {
    method: req.method === 'HEAD' ? 'HEAD' : 'GET',
    redirect: 'follow',
    headers: {
      // 很多机场会根据 UA 返回不同格式；Clash 类 UA 通常会返回 YAML 和 subscription-userinfo。
      // 注意：MiSub 发给代理的 User-Agent 不一定会自动成为代理访问机场时的 UA，
      // 所以这里必须显式使用 ua 参数 / x-user-agent 覆盖上游请求 UA。
      'user-agent': getUpstreamUserAgent(req, requestUrl),
      'accept': '*/*',
    },
  });

  const responseHeaders = createCorsHeaders();

  for (const headerName of PASS_THROUGH_RESPONSE_HEADERS) {
    const value = upstreamResponse.headers.get(headerName);
    if (value) responseHeaders[headerName] = value;
  }

  // 如果上游没有 Content-Type，给一个安全默认值
  if (!responseHeaders['content-type']) {
    responseHeaders['content-type'] = 'text/plain; charset=utf-8';
  }

  applyHeaders(res, responseHeaders);
  res.statusCode = upstreamResponse.status;

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const body = Buffer.from(await upstreamResponse.arrayBuffer());
  res.end(body);
};
