#!/usr/bin/env bash
# 本地开发：启动 / 停止 FastAPI（uvicorn）与 Vite 前端

SCRIPT_SOURCE="${BASH_SOURCE[0]:-$0}"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_SOURCE")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SCRIPT_PATH="$SCRIPT_DIR/$(basename "$SCRIPT_SOURCE")"
RUN_DIR="$ROOT/.run"
BACKEND_PID="$RUN_DIR/backend.pid"
FRONTEND_PID="$RUN_DIR/frontend.pid"
BACKEND_LOG="$RUN_DIR/backend.log"
FRONTEND_LOG="$RUN_DIR/frontend.log"

mkdir -p "$RUN_DIR"

die() { echo "错误: $*" >&2; exit 1; }

resolve_python() {
  if [[ -x "$ROOT/backend/venv/bin/python" ]]; then
    echo "$ROOT/backend/venv/bin/python"
  elif [[ -x "$ROOT/backend/.venv/bin/python" ]]; then
    echo "$ROOT/backend/.venv/bin/python"
  elif command -v python3 >/dev/null 2>&1; then
    command -v python3
  else
    die "未找到 Python，请在 backend 下创建 venv 并 pip install -r requirements.txt"
  fi
}

start_backend() {
  if [[ -f "$BACKEND_PID" ]] && kill -0 "$(cat "$BACKEND_PID")" 2>/dev/null; then
    echo "后端已在运行 (PID $(cat "$BACKEND_PID"))"
    return 0
  fi
  local py
  py="$(resolve_python)"
  cd "$ROOT/backend" || die "无法进入 backend 目录"
  nohup "$py" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 \
    >"$BACKEND_LOG" 2>&1 &
  echo $! >"$BACKEND_PID"
  echo "后端已启动 PID $(cat "$BACKEND_PID")，日志: $BACKEND_LOG"
}

start_frontend() {
  if [[ -f "$FRONTEND_PID" ]] && kill -0 "$(cat "$FRONTEND_PID")" 2>/dev/null; then
    echo "前端已在运行 (PID $(cat "$FRONTEND_PID"))"
    return 0
  fi
  if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
    die "请先执行: cd frontend && npm install"
  fi
  cd "$ROOT/frontend" || die "无法进入 frontend 目录"
  nohup npm run dev >"$FRONTEND_LOG" 2>&1 &
  echo $! >"$FRONTEND_PID"
  echo "前端已启动 PID $(cat "$FRONTEND_PID")，日志: $FRONTEND_LOG"
}

kill_tree() {
  local pid=$1
  local children c
  children=$(pgrep -P "$pid" 2>/dev/null || true)
  for c in $children; do
    kill_tree "$c"
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
  fi
}

stop_one() {
  local pidfile=$1
  local name=$2
  if [[ ! -f "$pidfile" ]]; then
    echo "$name: 无 PID 记录（可能未通过本脚本启动）"
    return 0
  fi
  local pid
  pid=$(cat "$pidfile")
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "$name: 进程已不存在，清理 PID 文件"
    rm -f "$pidfile"
    return 0
  fi
  kill_tree "$pid"
  sleep 1
  if kill -0 "$pid" 2>/dev/null; then
    kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$pidfile"
  echo "已停止 $name"
}

print_status() {
  local name=$1
  local pidfile=$2
  if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "$name: 运行中 (PID $(cat "$pidfile"))"
  else
    echo "$name: 未运行"
  fi
}

case "${1:-}" in
  start)
    start_backend
    start_frontend
    echo ""
    echo "API 文档: http://127.0.0.1:8000/docs"
    echo "前端页面: http://127.0.0.1:5173"
    ;;
  stop)
    stop_one "$FRONTEND_PID" "前端"
    stop_one "$BACKEND_PID" "后端"
    ;;
  restart)
    bash "$SCRIPT_PATH" stop
    sleep 1
    bash "$SCRIPT_PATH" start
    ;;
  status)
    print_status "后端" "$BACKEND_PID"
    print_status "前端" "$FRONTEND_PID"
    ;;
  *)
    echo "用法: $(basename "$0") {start|stop|restart|status}"
    exit 1
    ;;
esac
