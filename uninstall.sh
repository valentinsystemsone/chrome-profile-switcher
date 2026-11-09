#!/bin/bash
# Removes the native helper. Remove the extension itself from chrome://extensions in each profile.
set -euo pipefail
rm -f "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.valentin.profile_switcher.json"
rm -rf "$HOME/.chrome-profile-switcher"
echo "Helper removed."
