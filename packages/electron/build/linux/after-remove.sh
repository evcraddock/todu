#!/bin/bash
# Post-remove: clean up todu CLI symlinks.
if [ -L /usr/local/bin/todu ]; then
  rm -f /usr/local/bin/todu
fi
if [ -L /usr/local/bin/toduai ]; then
  rm -f /usr/local/bin/toduai
fi
