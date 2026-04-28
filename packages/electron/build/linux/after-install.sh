#!/bin/bash
# Post-install: create the primary todu CLI symlink.
CLI_PATH="/opt/todu/resources/cli/todu"
if [ -f "$CLI_PATH" ]; then
  chmod +x "$CLI_PATH"
  ln -sf "$CLI_PATH" /usr/local/bin/todu
fi
