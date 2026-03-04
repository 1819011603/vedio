#!/bin/bash
# 启动 Chrome 并禁用反调试检测
# 用法: ./launch-chrome-no-debug-detect.sh [URL]

URL="${1:-https://www.ncat22.com/detail/8925.html}"

# macOS Chrome 路径
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# 启动 Chrome，注入脚本覆盖调试检测
"$CHROME_PATH" \
  --disable-blink-features=AutomationControlled \
  --disable-features=IsolateOrigins,site-per-process \
  --user-data-dir="/tmp/chrome-no-debug-$$" \
  "$URL" &

echo "Chrome 已启动，可以正常使用开发者工具了"
