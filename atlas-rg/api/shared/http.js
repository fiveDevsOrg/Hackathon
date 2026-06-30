function jsonResponse(status, body, extraHeaders = {}) {
  return withCors(status, JSON.stringify(body), {
    "Content-Type": "application/json",
    ...extraHeaders,
  });
}

function withCors(status, body, headers = {}) {
  return {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-atlas-api-key",
      ...headers,
    },
    body,
  };
}

module.exports = {
  jsonResponse,
  withCors,
};
