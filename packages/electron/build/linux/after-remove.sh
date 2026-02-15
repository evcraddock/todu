#!/bin/bash
# Post-remove: clean up todu CLI symlink
if [ -L /usr/local/bin/todu ]; then
  rm -f /usr/local/bin/todu
fi
