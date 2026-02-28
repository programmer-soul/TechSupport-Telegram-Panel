import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Rate } from "k6/metrics";
import { baseUrl, loginSession } from "./lib/auth.js";

const duration = __ENV.DURATION || "3m";
const vus = Number(__ENV.VUS || 80);

export const options = {
  scenarios: {
    sockets: {
      executor: "constant-vus",
      vus,
      duration,
    },
  },
  thresholds: {
    ws_connect_ok_rate: ["rate>0.99"],
    ws_connect_fail_count: ["count<5"],
    checks: ["rate>0.99"],
  },
};

const wsConnectOkRate = new Rate("ws_connect_ok_rate");
const wsConnectFailCount = new Counter("ws_connect_fail_count");

function wsBaseUrl() {
  const u = baseUrl();
  if (u.startsWith("https://")) return u.replace("https://", "wss://");
  if (u.startsWith("http://")) return u.replace("http://", "ws://");
  return u;
}

export function setup() {
  return loginSession();
}

export default function (session) {
  const url = session?.url || baseUrl();
  const wsUrl = `${wsBaseUrl()}/ws`;
  const headers = { "Content-Type": "application/json" };

  const whoAmI = http.get(`${url}/api/auth/me`, { headers, tags: { name: "auth_me" } });
  const okMe = check(whoAmI, { "auth/me 200": (r) => r.status === 200 });
  if (!okMe) {
    sleep(1);
    return;
  }

  const res = ws.connect(wsUrl, {}, (socket) => {
    socket.on("open", () => {
      wsConnectOkRate.add(true);
      socket.setInterval(() => {
        socket.send("ping");
      }, 15000);
    });

    socket.on("error", () => {
      wsConnectFailCount.add(1);
      wsConnectOkRate.add(false);
    });

    socket.setTimeout(() => {
      socket.close();
    }, 45000);
  });

  const okWs = check(res, { "ws status is 101": (r) => r && r.status === 101 });
  if (!okWs) {
    wsConnectFailCount.add(1);
    wsConnectOkRate.add(false);
  }

  sleep(0.2);
}

