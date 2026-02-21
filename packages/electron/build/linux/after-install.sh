#!/bin/bash
# Post-install: create toduai CLI symlink
CLI_PATH="/opt/toduai/resources/cli/toduai"
if [ -f "$CLI_PATH" ]; then
  chmod +x "$CLI_PATH"
  ln -sf "$CLI_PATH" /usr/local/bin/toduai
fi
