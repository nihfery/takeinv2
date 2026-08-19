import http from "k6/http";
import { check, fail } from "k6";
import { Rate } from "k6/metrics";

export const options = {
  vus: Number(__ENV.VUS || 10),
  iterations: Number(__ENV.ITERATIONS || 100),
  summaryTrendStats: ["min", "med", "p(95)", "p(99)", "max"],
};

const errors = new Rate("booking_error_ratio");
const baseURL = (__ENV.BASE_URL || "http://127.0.0.1:8088").replace(/\/$/, "");

export function setup() {
  if (__ENV.ACCESS_TOKEN) return { token: __ENV.ACCESS_TOKEN };
  const response = http.post(`${baseURL}/api/auth/login`, JSON.stringify({
    email: __ENV.LOGIN_EMAIL || "customer@example.test",
    password: __ENV.LOGIN_PASSWORD || "password123",
    role: "customer",
  }), { headers: { "Content-Type": "application/json" } });
  const token = response.json("access_token") || response.json("data.access_token");
  if (!token) fail(`login did not return an access token (status ${response.status})`);
  return { token };
}

export default function (data) {
  const sequence = `${__VU}-${__ITER}-${Date.now()}`;
  const payload = {
    branch_id: Number(__ENV.BRANCH_ID || 1),
    service_ids: String(__ENV.SERVICE_IDS || "1").split(",").map(Number),
    booking_type: "scheduled",
    booking_date: __ENV.BOOKING_DATE || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    start_time: __ENV.START_TIME || "10:00",
    payment_type: "full_payment",
    payment_channel: "qris",
  };
  if (__ENV.STAFF_ID) payload.staff_id = Number(__ENV.STAFF_ID);
  const response = http.post(`${baseURL}/api/customer/bookings`, JSON.stringify(payload), {
    headers: {
      Authorization: `Bearer ${data.token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `k6-${sequence}`,
    },
    tags: { operation: "booking_create" },
  });
  const ok = check(response, { "booking accepted or conflicts safely": (value) => [201, 409].includes(value.status) });
  errors.add(!ok);
}
