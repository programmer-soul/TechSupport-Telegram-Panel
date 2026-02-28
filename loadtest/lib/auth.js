import http from "k6/http";
import { check, fail } from "k6";

export function requireEnv(name) {
  const value = __ENV[name];
  if (!value) {
    fail(`Missing required env: ${name}`);
  }
  return value;
}

export function baseUrl() {
  const url = requireEnv("BASE_URL");
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function loginSession() {
  const url = baseUrl();
  const username = requireEnv("ADMIN_USERNAME");
  const password = requireEnv("ADMIN_PASSWORD");

  const payload = JSON.stringify({ username, password });
  const res = http.post(`${url}/api/auth/login`, payload, {
    headers: { "Content-Type": "application/json" },
    tags: { name: "auth_login" },
  });

  check(res, {
    "login status is 200": (r) => r.status === 200,
  }) || fail(`Login failed: status=${res.status} body=${res.body}`);

  const csrfToken = getCookieByName(res, "csrf_token");
  if (!csrfToken) {
    fail("csrf_token cookie is missing after login");
  }

  return { url, csrfToken };
}

function getCookieByName(res, cookieName) {
  const setCookies = res.headers["Set-Cookie"];
  if (!setCookies) return "";
  const values = Array.isArray(setCookies) ? setCookies : [setCookies];
  const prefix = `${cookieName}=`;
  for (const item of values) {
    const parts = String(item).split(";");
    for (const p of parts) {
      const trimmed = p.trim();
      if (trimmed.startsWith(prefix)) {
        return trimmed.slice(prefix.length);
      }
    }
  }
  return "";
}

