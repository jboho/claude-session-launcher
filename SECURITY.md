# Security policy

## Supported versions

Security fixes go into the latest release only. Update to it before reporting.

## Reporting a vulnerability

Report privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability** ([direct link](https://github.com/jboho/claude-session-launcher/security/advisories/new)). Please don't open a public issue for a security problem.

Include the app version, your macOS version, steps to reproduce, and what an attacker gains.

## What counts

Claude Launcher builds a `claude` command line from your presets and settings and runs it in your terminal. Examples of things worth reporting:

- A preset, model, directory or other setting that makes the launched command run something other than `claude`, or get parsed as a `claude` flag it shouldn't be.
- A value that escapes the shell quoting in the launch string, in either the Rust launch path or the preview.
- A way to make the signed app run code other than its own, for example through environment variables or files placed next to it.
