#!/bin/bash
# Post-remove: clean up toduai CLI symlink
if [ -L /usr/local/bin/toduai ]; then
  rm -f /usr/local/bin/toduai
fi
