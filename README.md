# Claude Session Launcher

A menu-bar/tray widget that launches a `claude` CLI session in your terminal with
model / permission-mode / effort (plus working directory and an initial command)
preselected — and lets you save named presets for one-click launch.

## Develop

```bash
command pnpm install
command pnpm test      # unit tests (Vitest)
command pnpm start     # build + launch the app
```

## Config (portable)

- Presets: `~/.config/claude-launcher/presets.json`
- Settings: `~/.config/claude-launcher/settings.json`
- Override the location with `CLAUDE_LAUNCHER_CONFIG=/path/to/presets.json`.

Both are plain JSON — sync them via dotfiles.

## Platform support (v1)

macOS only (launches iTerm, or Apple Terminal via Settings). Windows/Linux report
"not implemented in v1" — the spawner is the only platform-specific piece.
