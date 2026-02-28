import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";
import { baseUrl, requireEnv } from "./lib/auth.js";

const duration = __ENV.DURATION || "5m";
const vus = Number(__ENV.VUS || 50);
const maxRps = Number(__ENV.MAX_RPS || 0);

export const options = {
  scenarios: {
    bot_ingress: {
      executor: "constant-vus",
      vus,
      duration,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<700", "p(99)<1500"],
    checks: ["rate>0.99"],
  },
  rps: maxRps > 0 ? maxRps : undefined,
};

const incomingTrend = new Trend("bot_incoming_ms");

function rnd(max) {
  return Math.floor(Math.random() * max);
}

export default function () {
  const url = baseUrl();
  const token = requireEnv("BOT_INTERNAL_TOKEN");
  const tgId = 7_000_000_000 + __VU * 100_000 + __ITER;
  const username = `loaduser_${__VU}_${__ITER}`;
  const headers = {
    "Content-Type": "application/json",
    "X-Internal-Token": token,
  };

  const chatRes = http.post(
    `${url}/api/bot/chat`,
    JSON.stringify({
      tg_id: tgId,
      tg_username: username,
      first_name: "Load",
      last_name: "Test",
      language_code: "en",
    }),
    { headers, tags: { name: "bot_chat" } }
  );
  check(chatRes, { "bot/chat 200": (r) => r.status === 200 });

  const text = `k6 incoming message ${__VU}-${__ITER}-${rnd(1_000_000)}`;
  const incomingRes = http.post(
    `${url}/api/bot/incoming`,
    JSON.stringify({
      tg_id: tgId,
      tg_username: username,
      first_name: "Load",
      last_name: "Test",
      language_code: "en",
      type: "TEXT",
      text,
      attachments: [],
      telegram_message_id: rnd(1_000_000_000),
      telegram_media_group_id: null,
    }),
    { headers, tags: { name: "bot_incoming" } }
  );
  incomingTrend.add(incomingRes.timings.duration);
  check(incomingRes, {
    "bot/incoming 200": (r) => r.status === 200,
  });

  sleep(Math.random() * 0.4 + 0.05);
}

