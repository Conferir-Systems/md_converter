# MarkItDown GUI

Windows 11 desktop app that converts documents to Markdown using Microsoft's
[markitdown](https://github.com/microsoft/markitdown). Electron front end; the
Python side ships as a self-contained PyInstaller sidecar — **no Python needed
on the user's machine**.

Supported formats: PDF, DOCX, PPTX, XLSX, XLS, CSV, JSON, XML, HTML, TXT, ZIP
(a ZIP converts to a single Markdown file concatenating its convertible
contents). Audio, images, YouTube, Azure Document Intelligence, and plugins are
deliberately out of scope.

## Installing

Two artifacts are produced in `release/`:

- **`MarkItDown GUI Setup <version>.exe`** (NSIS installer) — recommended.
  Installs per-user, no administrator rights.
- **`MarkItDown GUI <version>.exe`** (portable) — single file, no
  installation. Trade-off: it re-extracts the whole app (~350 MB) to `%TEMP%`
  on **every launch**, so expect a long startup (tens of seconds) plus
  antivirus scanning of the extracted files each time.

### Warnings you should expect (unsigned build)

- **SmartScreen**: the executables are not code-signed, so Windows shows
  "Windows protected your PC" — *More info → Run anyway*. Code signing (OV/EV
  certificate) is planned but out of scope for this iteration.
- **Antivirus false positives**: the sidecar `markitdown-bridge.exe` is a
  PyInstaller binary, a classic AV-heuristics target. If conversions suddenly
  fail instantly with an error naming that exe, your antivirus likely
  quarantined it — restore it or add an exclusion for the install folder.

## Notes and limitations

- The interface is in Portuguese. Technical diagnostics coming from the
  converter itself stay in English.
- Individual conversions can be canceled while a batch runs (Cancel on the
  row); canceled rows can be re-converted later.
- Generic `.xml` files pass through as plain text (markitdown has no
  structural XML converter; RSS/Atom feeds are the exception).
- Output files are always UTF-8. Name collisions are auto-suffixed
  (`report.md`, `report (1).md`) — nothing is ever overwritten.
- One file failing (corrupted, password-protected…) never stops the rest of
  the batch; the row shows a readable error instead.
- Per-conversion timeout: 120 s.

## Verifying on a clean machine

The development machine masks packaging failures because Python is installed.
The build was tested with Python stripped from `PATH`, but the honest test is:
install on a Windows 11 machine (or VM) that never had Python, and convert one
file of each format. A single successful conversion already proves the bundled
converter registry and magika model made it into the package.

## Development

Prerequisites: Node.js LTS, Python 3.12.

```
npm install
python -m venv python\.venv
python\.venv\Scripts\python.exe -m pip install -r python\requirements.txt -r python\requirements-dev.txt
python\.venv\Scripts\python.exe fixtures\make_fixtures.py   # test documents
npm start                                                   # dev app (uses the venv bridge)
npm run dist                                                # sidecar freeze + NSIS + portable
```

`src/bridge.js` picks the sidecar automatically: packaged exe in production,
`resources/py/` exe if you have run `npm run build:py`, otherwise the venv
Python running `python/bridge.py`.

Architecture, in one line per hop: renderer (sandboxed HTML/JS) →
`contextBridge` preload (named functions only) → `ipcRenderer.invoke` → main
process (validation, queue of 2, output reservation) → spawn
`markitdown-bridge.exe` per file (JSON over stdin/stdout, `windowsHide`) →
markitdown.

Dev self-test hooks (inert unless set): `MDGUI_SHOT=<png>` screenshots the
window and quits; `MDGUI_UITEST=<dir>` feeds a folder through the real UI;
`MDGUI_SELFTEST=<dir>` (+ optional `MDGUI_SELFTEST_OUT=<dir>`) runs the
conversion queue headlessly.
