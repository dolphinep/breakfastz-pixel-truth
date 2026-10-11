# Test fixtures

Real-world images used by the e2e tests (`tests/e2e/app.spec.ts`) and `npm run samples`.
They are **not committed** — some have unclear redistribution terms. Download them with:

```sh
./scripts/fetch-samples.sh   # → tests/fixtures/samples/
```

Tests that need them are skipped when the files are missing.

| File | Kind | Source | License |
|---|---|---|---|
| `ai-horror-monster.jpg` | AI "pixel art" (ClipDrop Stable Doodle) — obvious mixels | [OpenGameArt](https://opengameart.org/content/pixel-art-creatures-from-clipdrop-stable-doodle) | CC0 (per uploader) |
| `eve-right.png` | 64px sprite with pixel-level noise | [OpenGameArt — eve 64x64](https://opengameart.org/node/180511) | CC0 |
| `rpg-assets-1x.png` | native 1:1 pixel art | [OpenGameArt — RPG character sprites (GrafxKid)](https://opengameart.org/content/rpg-character-sprites) | CC0 |
| `rpg-preview.png` | clean ×4 upscale | same page as above | CC0 |
| `photo-fried-egg.jpg` | real photo | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Fried_egg,_sunny_side_up.jpg) | Public domain |
