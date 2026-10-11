#!/usr/bin/env bash
# Download the real-world test images into tests/fixtures/samples (credits: tests/fixtures/README.md)
set -euo pipefail
D="$(cd "$(dirname "$0")/.." && pwd)/tests/fixtures/samples"
mkdir -p "$D"
get() { curl -sSL -A "Mozilla/5.0" -o "$D/$1" "$2" && echo "✓ $1"; }
get ai-horror-monster.jpg https://opengameart.org/sites/default/files/horror_monster.jpg
get eve-right.png https://opengameart.org/sites/default/files/eve-going-right.png
get rpg-assets-1x.png https://opengameart.org/sites/default/files/RPG_assets.png
get rpg-preview.png https://opengameart.org/sites/default/files/RPGpreview.png
get photo-fried-egg.jpg "https://upload.wikimedia.org/wikipedia/commons/0/02/Fried_egg%2C_sunny_side_up.jpg"
