#!/usr/bin/env node

import process from 'node:process';
import { performance } from 'node:perf_hooks';

const OPTION_DEFINITIONS = {
  'backend-base-url': {
    env: 'LOAD_BACKEND_BASE_URL',
    defaultValue: 'http://127.0.0.1:8088',
    parse: parseBaseUrl,
  },
  'customer-base-url': {
    env: 'LOAD_CUSTOMER_BASE_URL',
    defaultValue: 'http://127.0.0.1:5174',
    parse: parseBaseUrl,
  },
  'provider-base-url': {
    env: 'LOAD_PROVIDER_BASE_URL',
    defaultValue: 'http://127.0.0.1:5173',
    parse: parseBaseUrl,
  },
  requests: {
    env: 'LOAD_REQUESTS',
    defaultValue: '120',
    parse: (value) => parseInteger(value, 'requests', 6, 1_000_000),
  },
  concurrency: {
    env: 'LOAD_CONCURRENCY',
    defaultValue: '6',
    parse: (value) => parseInteger(value, 'concurrency', 1, 10_000),
  },
  'timeout-ms': {
    env: 'LOAD_TIMEOUT_MS',
    defaultValue: '15000',
    parse: (value) => parseInteger(value, 'timeout-ms', 1, 300_000),
  },
  'max-p95-ms': {
    env: 'LOAD_MAX_P95_MS',
    defaultValue: '2000',
    parse: (value) => parseNumber(value, 'max-p95-ms', 0),
  },
  'max-p99-ms': {
    env: 'LOAD_MAX_P99_MS',
    defaultValue: '5000',
    parse: (value) => parseNumber(value, 'max-p99-ms', 0),
  },
  'min-throughput-rps': {
    env: 'LOAD_MIN_THROUGHPUT_RPS',
    defaultValue: '5',
    parse: (value) => parseNumber(value, 'min-throughput-rps', 0),
  },
};

function usage() {
  return `Usage: node tests/load/basic-http-load.mjs [options]

Runs a read-only mixed HTTP load gate against the backend, customer, and
provider surfaces. Every non-2xx response or request error fails the gate.

Options (environment variable; default):
  --backend-base-url URL       (LOAD_BACKEND_BASE_URL; http://127.0.0.1:8088)
  --customer-base-url URL      (LOAD_CUSTOMER_BASE_URL; http://127.0.0.1:5174)
  --provider-base-url URL      (LOAD_PROVIDER_BASE_URL; http://127.0.0.1:5173)
  --requests NUMBER            (LOAD_REQUESTS; 120, minimum 6)
  --concurrency NUMBER         (LOAD_CONCURRENCY; 6)
  --timeout-ms NUMBER          (LOAD_TIMEOUT_MS; 15000)
  --max-p95-ms NUMBER          (LOAD_MAX_P95_MS; 2000, 0 disables)
  --max-p99-ms NUMBER          (LOAD_MAX_P99_MS; 5000, 0 disables)
  --min-throughput-rps NUMBER  (LOAD_MIN_THROUGHPUT_RPS; 5, 0 disables)
  --help

Arguments accept both "--name value" and "--name=value" forms.
`;
}

function parseArguments(argv) {
  const supplied = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help') {
      return { help: true };
    }

    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${argument}`);
    }

    const separatorIndex = argument.indexOf('=');
    const name = argument.slice(2, separatorIndex === -1 ? undefined : separatorIndex);

    if (!(name in OPTION_DEFINITIONS)) {
      throw new Error(`Unknown option: --${name}`);
    }

    if (supplied.has(name)) {
      throw new Error(`Option may only be provided once: --${name}`);
    }

    let value;
    if (separatorIndex !== -1) {
      value = argument.slice(separatorIndex + 1);
    } else {
      index += 1;
      value = argv[index];
    }

    if (value === undefined || value === '' || value.startsWith('--')) {
      throw new Error(`Missing value for --${name}`);
    }

    supplied.set(name, value);
  }

  const configuration = {};
  for (const [name, definition] of Object.entries(OPTION_DEFINITIONS)) {
    const rawValue = supplied.get(name) ?? process.env[definition.env] ?? definition.defaultValue;
    configuration[toCamelCase(name)] = definition.parse(rawValue);
  }

  configuration.concurrency = Math.min(configuration.concurrency, configuration.requests);

  return configuration;
}

function parseBaseUrl(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid base URL: ${value}`);
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`Base URL must be an HTTP(S) URL without credentials, query, or fragment: ${value}`);
  }

  return url.toString().replace(/\/$/, '');
}

function parseInteger(value, name, minimum, maximum) {
  if (!/^\d+$/.test(String(value))) {
    throw new Error(`--${name} must be an integer`);
  }

  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new Error(`--${name} must be between ${minimum} and ${maximum}`);
  }

  return number;
}

function parseNumber(value, name, minimum) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < minimum) {
    throw new Error(`--${name} must be a finite number greater than or equal to ${minimum}`);
  }

  return number;
}

function toCamelCase(value) {
  return value.replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase());
}

function joinUrl(baseUrl, path) {
  return `${baseUrl}${path}`;
}

function createEndpoints(configuration) {
  return [
    {
      name: 'backend-health',
      url: joinUrl(configuration.backendBaseUrl, '/api/health'),
    },
    {
      name: 'backend-readiness',
      url: joinUrl(configuration.backendBaseUrl, '/api/readiness'),
    },
    {
      name: 'catalog-categories',
      url: joinUrl(configuration.backendBaseUrl, '/api/categories'),
    },
    {
      name: 'catalog-services',
      url: joinUrl(configuration.backendBaseUrl, '/api/services?per_page=12'),
    },
    {
      name: 'customer-home',
      url: joinUrl(configuration.customerBaseUrl, '/'),
    },
    {
      name: 'provider-home',
      url: joinUrl(configuration.providerBaseUrl, '/'),
    },
  ];
}

async function executeRequest(endpoint, requestNumber, timeoutMs) {
  const startedAt = performance.now();

  try {
    const response = await fetch(endpoint.url, {
      method: 'GET',
      headers: {
        Accept: '*/*',
        'User-Agent': 'takein-basic-http-load/1.0',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });

    const body = await response.arrayBuffer();
    const latencyMs = performance.now() - startedAt;

    return {
      requestNumber,
      endpoint: endpoint.name,
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      bytes: body.byteLength,
      latencyMs,
      error: response.status >= 200 && response.status < 300 ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      requestNumber,
      endpoint: endpoint.name,
      ok: false,
      status: null,
      bytes: 0,
      latencyMs: performance.now() - startedAt,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}

async function runLoad(configuration, endpoints) {
  const results = new Array(configuration.requests);
  let nextRequestIndex = 0;

  async function worker() {
    while (true) {
      const requestIndex = nextRequestIndex;
      nextRequestIndex += 1;

      if (requestIndex >= configuration.requests) {
        return;
      }

      const endpoint = endpoints[requestIndex % endpoints.length];
      results[requestIndex] = await executeRequest(
        endpoint,
        requestIndex + 1,
        configuration.timeoutMs,
      );
    }
  }

  const startedAt = performance.now();
  await Promise.all(Array.from({ length: configuration.concurrency }, () => worker()));
  const durationMs = performance.now() - startedAt;

  return { results, durationMs };
}

function round(value, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function percentile(sortedValues, probability) {
  if (sortedValues.length === 0) {
    return null;
  }

  const index = Math.max(0, Math.ceil(probability * sortedValues.length) - 1);
  return sortedValues[index];
}

function latencySummary(results) {
  const values = results.map((result) => result.latencyMs).sort((left, right) => left - right);
  const total = values.reduce((sum, value) => sum + value, 0);

  return {
    min: round(values[0]),
    average: round(total / values.length),
    p50: round(percentile(values, 0.5)),
    p95: round(percentile(values, 0.95)),
    p99: round(percentile(values, 0.99)),
    max: round(values.at(-1)),
  };
}

function summarize(configuration, endpoints, results, durationMs) {
  const successes = results.filter((result) => result.ok);
  const failures = results.filter((result) => !result.ok);
  const statusCounts = {};
  const errorCounts = {};

  for (const result of results) {
    const statusKey = result.status === null ? 'transport-error' : String(result.status);
    statusCounts[statusKey] = (statusCounts[statusKey] ?? 0) + 1;

    if (result.error !== null) {
      errorCounts[result.error] = (errorCounts[result.error] ?? 0) + 1;
    }
  }

  const perEndpoint = endpoints.map((endpoint) => {
    const endpointResults = results.filter((result) => result.endpoint === endpoint.name);
    const endpointSuccesses = endpointResults.filter((result) => result.ok).length;

    return {
      name: endpoint.name,
      url: endpoint.url,
      requests: endpointResults.length,
      successes: endpointSuccesses,
      errors: endpointResults.length - endpointSuccesses,
      bytes: endpointResults.reduce((sum, result) => sum + result.bytes, 0),
      latencyMs: latencySummary(endpointResults),
    };
  });

  const latencyMs = latencySummary(results);
  const throughputRequestsPerSecond = (results.length * 1000) / durationMs;
  const thresholdViolations = [];

  if (failures.length > 0) {
    thresholdViolations.push(`${failures.length} request(s) failed`);
  }
  if (configuration.maxP95Ms > 0 && latencyMs.p95 > configuration.maxP95Ms) {
    thresholdViolations.push(`p95 ${latencyMs.p95}ms exceeds ${configuration.maxP95Ms}ms`);
  }
  if (configuration.maxP99Ms > 0 && latencyMs.p99 > configuration.maxP99Ms) {
    thresholdViolations.push(`p99 ${latencyMs.p99}ms exceeds ${configuration.maxP99Ms}ms`);
  }
  if (
    configuration.minThroughputRps > 0
    && throughputRequestsPerSecond < configuration.minThroughputRps
  ) {
    thresholdViolations.push(
      `throughput ${round(throughputRequestsPerSecond)} req/s is below ${configuration.minThroughputRps} req/s`,
    );
  }

  return {
    passed: thresholdViolations.length === 0,
    configuration: {
      requests: configuration.requests,
      concurrency: configuration.concurrency,
      timeoutMs: configuration.timeoutMs,
      thresholds: {
        maxP95Ms: configuration.maxP95Ms,
        maxP99Ms: configuration.maxP99Ms,
        minThroughputRequestsPerSecond: configuration.minThroughputRps,
        errorsAllowed: 0,
      },
    },
    totals: {
      requests: results.length,
      successes: successes.length,
      errors: failures.length,
      errorRatePercent: round((failures.length / results.length) * 100),
      bytes: results.reduce((sum, result) => sum + result.bytes, 0),
      durationMs: round(durationMs),
      throughputRequestsPerSecond: round(throughputRequestsPerSecond),
      latencyMs,
    },
    statusCounts,
    errorCounts,
    perEndpoint,
    thresholdViolations,
    failureSamples: failures.slice(0, 20).map((result) => ({
      requestNumber: result.requestNumber,
      endpoint: result.endpoint,
      status: result.status,
      latencyMs: round(result.latencyMs),
      error: result.error,
    })),
  };
}

async function main() {
  let configuration;

  try {
    configuration = parseArguments(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`Configuration error: ${error.message}\n\n${usage()}`);
    process.exitCode = 2;
    return;
  }

  if (configuration.help) {
    process.stdout.write(usage());
    return;
  }

  const endpoints = createEndpoints(configuration);
  const { results, durationMs } = await runLoad(configuration, endpoints);
  const report = summarize(configuration, endpoints, results, durationMs);

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (!report.passed) {
    process.exitCode = 1;
  }
}

await main();
