#!/bin/bash
# Post-install: create primary todu CLI symlink and preserve toduai compatibility.
CLI_PATH="/opt/todu/resources/cli/todu"
if [ -f "$CLI_PATH" ]; then
  chmod +x "$CLI_PATH"
  ln -sf "$CLI_PATH" /usr/local/bin/todu
  ln -sf "$CLI_PATH" /usr/local/bin/toduai
fi
