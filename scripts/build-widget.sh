#!/bin/bash
set -euo pipefail

# Build RevisionWidget appex and embed into Revision.app
# For personal use — ad-hoc signing, no developer team required

WIDGET_DIR="src-tauri/RevisionWidget"
APP_BUNDLE="src-tauri/target/debug/bundle/macos/Revision.app"
# Also check release bundle
if [ ! -d "$APP_BUNDLE" ]; then
  APP_BUNDLE="src-tauri/target/release/bundle/macos/Revision.app"
fi

if [ ! -d "$WIDGET_DIR" ]; then
  echo "Widget dir not found: $WIDGET_DIR"
  exit 1
fi

echo "→ Generating Xcode project for widget..."
cd "$WIDGET_DIR"
xcodegen generate 2>&1 | tail -n 20
echo "✓ Generated RevisionWidget.xcodeproj"

echo "→ Building widget (Release, ad-hoc sign)..."
# Build for macOS, arm64 + x86_64
xcodebuild -project RevisionWidget.xcodeproj \
  -target RevisionWidget \
  -configuration Release \
  CODE_SIGN_IDENTITY="-" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  MACOSX_DEPLOYMENT_TARGET=14.0 \
  build 2>&1 | tail -n 40

# Find built appex
APPEX=$(find ~/Library/Developer/Xcode/DerivedData -name "RevisionWidget.appex" -type d 2>/dev/null | head -n 1)
if [ -z "$APPEX" ]; then
  APPEX=$(find . -name "RevisionWidget.appex" -type d 2>/dev/null | head -n 1)
fi
# Also check DerivedData for RevisionWidget
if [ -z "$APPEX" ]; then
  APPEX=$(find build -name "RevisionWidget.appex" -type d 2>/dev/null | head -n 1 || true)
fi

if [ -z "$APPEX" ] || [ ! -d "$APPEX" ]; then
  echo "✗ Built appex not found. Searching..."
  find . -name "*.appex" 2>&1 | head
  # Try alternative: Xcode may have put it in build/Release
  APPEX=$(find . -path "*/Build/Products/Release/RevisionWidget.appex" 2>/dev/null | head -n 1 || true)
fi

if [ -z "$APPEX" ] || [ ! -d "$APPEX" ]; then
  echo "✗ Could not locate RevisionWidget.appex"
  exit 1
fi

echo "→ Found widget: $APPEX"

# Embed into main app bundle if it exists
if [ -d "$APP_BUNDLE" ]; then
  PLUGINS_DIR="$APP_BUNDLE/Contents/PlugIns"
  mkdir -p "$PLUGINS_DIR"
  echo "→ Embedding widget into $APP_BUNDLE"
  rm -rf "$PLUGINS_DIR/RevisionWidget.appex"
  cp -R "$APPEX" "$PLUGINS_DIR/"
  echo "✓ Embedded widget at $PLUGINS_DIR/RevisionWidget.appex"
  # Also copy to /Applications if installed
  if [ -d "/Applications/Revision.app" ]; then
    echo "→ Updating /Applications/Revision.app PlugIns"
    mkdir -p "/Applications/Revision.app/Contents/PlugIns"
    rm -rf "/Applications/Revision.app/Contents/PlugIns/RevisionWidget.appex"
    cp -R "$APPEX" "/Applications/Revision.app/Contents/PlugIns/"
    echo "✓ Updated /Applications widget"
  fi
else
  echo "→ Main app bundle not found at $APP_BUNDLE — widget built at $APPEX, will be embedded on next 'tauri build'"
  echo "  To embed manually: cp -R \"$APPEX\" \"/Applications/Revision.app/Contents/PlugIns/\""
fi

echo "✓ Widget ready — add via Desktop → Edit Widgets → Revision — Due Today"
echo "  (If not appearing, run: killall Dock; open /Applications/Revision.app)"
