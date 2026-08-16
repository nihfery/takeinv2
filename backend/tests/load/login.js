import http from "k6/http";
import { check } from "k6";
import { Rate } from "k6/metrics";

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || "30s",
  summaryTrendStats: ["min", "med", "p(95)", "p(99)", "max"],
};

const errors = new Rate("login_error_ratio");
const baseURL = (__ENV.BASE_URL || "http://127.0.0.1:8088").replace(/\/$/, "");

export default function () {
  const response = http.post(`${baseURL}/api/auth/login`, JSON.stringify({
    email: __ENV.LOGIN_EMAIL || "customer@example.test",
    password: __ENV.LOGIN_PASSWORD || "password123",
  }), { headers: { "Content-Type": "application/json" }, tags: { operation: "auth_login" } });
  const ok = check(response, { "login succeeds": (value) => value.status === 200 });
  errors.add(!ok);
}
