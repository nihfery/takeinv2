#!/usr/bin/env bash
set -u

services=(
  identity-service customer-service provider-service catalog-service
  booking-service payment-service billing-service notification-service
  chat-service media-service audit-service
)
http_ports=(18081 18082 18083 18084 18085 18086 18087 18088 18089 18090 18091)
metric_ports=(20081 20082 20083 20084 20085 20086 20087 20088 20089 20090 20091)
grpc_ports=(19081 19082 19083 19084 19085 19086 19087 19090)
api_pids=()
worker_pids=()
started_pid=

start_runtime() {
  local service="$1"
  local component="$2"
  local duration
  duration="$(printf '%s%s' "$3" s)"
  timeout --kill-after=5s "$duration" sh scripts/go/run-service.sh "$service" "$component" >/dev/null 2>&1 &
  started_pid=$!
}

wait_http() {
  local url="$1"
  local attempts="$2"
  local pid="$3"
  local i=0
  while [ "$i" -lt "$attempts" ]; do
    if curl --fail --silent --connect-timeout 1 --max-time 1 "$url" >/dev/null 2>&1; then
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      return 2
    fi
    i=$((i + 1))
    sleep 0.25
  done
  return 1
}

wait_for_timeouts() {
  local pid code
  for pid in "$@"; do
    code=0
    wait "$pid" || code=$?
    if [ "$code" -ne 124 ] && [ "$code" -ne 137 ]; then
      printf 'unexpected runtime exit: %s\n' "$code" >&2
      return 1
    fi
  done
}

start_runtime identity-service api 60
api_pids+=("$started_pid")
wait_http http://127.0.0.1:18081/health/ready 120 "$started_pid" || {
  echo 'identity native readiness failed' >&2
  exit 1
}

for ((i = 1; i < ${#services[@]}; i++)); do
  start_runtime "${services[$i]}" api 55
  api_pids+=("$started_pid")
done

for ((i = 0; i < ${#services[@]}; i++)); do
  wait_http "http://127.0.0.1:${http_ports[$i]}/health/ready" 160 "${api_pids[$i]}" || {
    printf 'API readiness failed: %s\n' "${services[$i]}" >&2
    exit 1
  }
  wait_http "http://127.0.0.1:${http_ports[$i]}/metrics" 20 "${api_pids[$i]}" || {
    printf 'API metrics failed: %s\n' "${services[$i]}" >&2
    exit 1
  }
done
echo 'native local APIs: 11 ready, 11 metrics'

for port in "${grpc_ports[@]}"; do
  (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null || {
    printf 'gRPC connection failed: %s\n' "$port" >&2
    exit 1
  }
done
echo 'native local gRPC: 8 connectable'

for service in "${services[@]}"; do
  start_runtime "$service" worker 35
  worker_pids+=("$started_pid")
done

for ((i = 0; i < ${#services[@]}; i++)); do
  wait_http "http://127.0.0.1:${metric_ports[$i]}/metrics" 120 "${worker_pids[$i]}" || {
    printf 'worker metrics failed: %s\n' "${services[$i]}" >&2
    exit 1
  }
done
echo 'native local workers: 11 metrics'

wait_for_timeouts "${worker_pids[@]}" "${api_pids[@]}"
sleep 1

for port in "${http_ports[@]}" "${metric_ports[@]}" "${grpc_ports[@]}"; do
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    printf 'runtime process remained on port: %s\n' "$port" >&2
    exit 1
  fi
done

echo 'native local process cleanup: PASS'
