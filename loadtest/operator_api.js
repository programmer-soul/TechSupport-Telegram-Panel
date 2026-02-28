import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";
import { baseUrl, loginSession } from "./lib/auth.js";

const duration = __ENV.DURATION || "5m";
const vus = Number(__ENV.VUS || 30);
const maxRps = Number(__ENV.MAX_RPS || 0);

export const options = {
  scenarios: {
    operators: {
      executor: "constant-vus",
      vus,
      duration,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500", "p(99)<1200"],
    checks: ["rate>0.99"],
  },
  rps: maxRps > 0 ? maxRps : undefined,
};

const listChatsTrend = new Trend("api_list_chats_ms");
const listMessagesTrend = new Trend("api_list_messages_ms");

export function setup() {
  return loginSession();
}

export default function (session) {
  const url = session?.url || baseUrl();
  const headers = { "Content-Type": "application/json" };

  const countsRes = http.get(`${url}/api/chats/counts`, {
    headers,
    tags: { name: "chats_counts" },
  });
  check(countsRes, { "counts 200": (r) => r.status === 200 });

  const chatsRes = http.get(`${url}/api/chats?tab=active&limit=30`, {
    headers,
    tags: { name: "chats_list" },
  });
  listChatsTrend.add(chatsRes.timings.duration);
  const okChats = check(chatsRes, {
    "chats list 200": (r) => r.status === 200,
    "chats list valid json": (r) => {
      try {
        return Array.isArray(r.json());
      } catch (e) {
        return false;
      }
    },
  });
  if (!okChats) {
    sleep(0.5);
    return;
  }

  const chats = chatsRes.json();
  if (Array.isArray(chats) && chats.length > 0) {
    const idx = Math.floor(Math.random() * Math.min(chats.length, 10));
    const chatId = chats[idx]?.id;
    if (chatId) {
      const messagesRes = http.get(`${url}/api/chats/${chatId}/messages?limit=50`, {
        headers,
        tags: { name: "messages_list" },
      });
      listMessagesTrend.add(messagesRes.timings.duration);
      check(messagesRes, {
        "messages list 200/409": (r) => r.status === 200 || r.status === 409,
      });
    }
  }

  sleep(Math.random() * 0.6 + 0.1);
}

