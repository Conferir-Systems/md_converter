// Light/dark preference, persisted in userData. Setting nativeTheme.themeSource
// is enough on its own: it also overrides what prefers-color-scheme reports in
// the renderer, so the @media block in styles.css does all the repainting.
const path = require('node:path')
const fs = require('node:fs')
const { app, nativeTheme } = require('electron')

const SOURCES = ['system', 'light', 'dark']

// Lazy: app.getPath is only meaningful once the app name is resolved.
function prefFile () {
  return path.join(app.getPath('userData'), 'preferences.json')
}

// A missing, unreadable or corrupt file must never block startup — fall back to
// following the OS, which is what the app did before the toggle existed.
function readTheme () {
  try {
    const stored = JSON.parse(fs.readFileSync(prefFile(), 'utf8')).theme
    return SOURCES.includes(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

// Best effort: a read-only profile costs the user persistence, not the session.
function writeTheme (value) {
  try {
    fs.writeFileSync(prefFile(), JSON.stringify({ theme: value }))
  } catch (err) {
    console.error(`theme: could not save preference: ${err.message}`)
  }
}

function applyStoredTheme () {
  nativeTheme.themeSource = readTheme()
}

// Rejects unknown values rather than letting Electron throw on themeSource.
function setTheme (value) {
  if (!SOURCES.includes(value)) return false
  nativeTheme.themeSource = value
  writeTheme(value)
  return true
}

function themeState () {
  return { source: nativeTheme.themeSource, dark: nativeTheme.shouldUseDarkColors }
}

module.exports = { applyStoredTheme, setTheme, themeState }
