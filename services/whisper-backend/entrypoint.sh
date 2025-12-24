#!/bin/bash
set -e

# Start Worker in background
python worker.py &
WORKER_PID=$!

# Start API Server
gunicorn --bind 0.0.0.0:5000 --timeout 600 app:app &
SERVER_PID=$!

echo "Started Worker ($WORKER_PID) and Server ($SERVER_PID)"

# Wait for both processes
wait -n

exit $?
