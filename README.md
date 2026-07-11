# OpenHeader

A tiny, open-source Chrome extension to modify HTTP request/response headers — a clean, transparent alternative to ModHeader.

📄 فارسی: [README.fa.md](README.fa.md)

## Install

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked** and select this folder

## Security

Nothing to worry about — no servers, no tracking, no obfuscation:

- No external servers, no analytics, no telemetry.
- Not minified/obfuscated — every line is readable.
- Uses Chrome's standard `declarativeNetRequest` API, so the extension never reads the content of your requests.
- All data stays in `chrome.storage.local` on your own device.

## License

MIT — [github.com/alinemone/modheader](https://github.com/alinemone/modheader)
