import http from "k6/http";
import { check } from "k6";
import { Rate } from "k6/metrics";

export const options = {
  vus: Number(__ENV.VUS || 20),
  duration: __ENV.DURATION || "30s",
  summaryTrendStats: ["min", "med", "p(95)", "p(99)", "max"],
};

const errors = new Rate("catalog_error_ratio");
const baseURL = (__ENV.BASE_URL || "http://127.0.0.1:8088").replace(/\/$/, "");

export default function () {
  const responses = http.batch([
    ["GET", `${baseURL}/api/categories`, null, { tags: { operation: "catalog_categories" } }],
    ["GET", `${baseURL}/api/services`, null, { tags: { operation: "catalog_services" } }],
    ["GET", `${baseURL}/api/branches`, null, { tags: { operation: "catalog_branches" } }],
  ]);
  for (const response of responses) {
    const ok = check(response, { "catalog response succeeds": (value) => value.status === 200 });
    errors.add(!ok);
  }
}
