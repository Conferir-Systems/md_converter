const path = require('node:path')
const fs = require('node:fs')
const { convertFile } = require('./bridge')
const { t } = require('./i18n')

// Keep in sync with the drop-zone caption in index.html and the format list in
// README.md — neither can read this array (the renderer is sandboxed).
const SUPPORTED_EXTENSIONS = ['pdf', 'docx', 'pptx', 'xlsx', 'xls', 'csv', 'json', 'xml', 'html', 'htm', 'txt', 'zip']
const CONCURRENCY = 2

const cancelRequested = new Set()
const activeCancels = new Map()

// Validates every job and reserves a unique output path for the whole batch
// up front — an exists-check at write time would race between the two workers.
function planJobs (jobs) {
  const claimed = new Set()
  return jobs.map(job => {
    const { id, input } = job
    if (typeof input !== 'string' || input.length === 0) {
      return { id, input, error: t('errInvalidPath') }
    }
    let stat
    try {
      stat = fs.statSync(input)
    } catch {
      return { id, input, error: t('errNotFound') }
    }
    if (!stat.isFile()) {
      return { id, input, error: t('errNotFile') }
    }
    const extension = path.extname(input).slice(1).toLowerCase()
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      return { id, input, error: t('errUnsupported', extension || '(?)') }
    }
    const dir = typeof job.outputDir === 'string' && job.outputDir.length > 0 ? job.outputDir : path.dirname(input)
    const base = path.basename(input, path.extname(input))
    let candidate = path.join(dir, `${base}.md`)
    let suffix = 1
    while (claimed.has(candidate.toLowerCase()) || fs.existsSync(candidate)) {
      candidate = path.join(dir, `${base} (${suffix}).md`)
      suffix += 1
    }
    claimed.add(candidate.toLowerCase())
    return { id, input, output: candidate }
  })
}

async function runQueue (planned, report) {
  const results = []
  let next = 0
  const worker = async () => {
    while (next < planned.length) {
      const job = planned[next]
      next += 1
      if (job.error) {
        report({ id: job.id, status: 'error', error: job.error, code: 'INVALID_INPUT' })
        results.push({ id: job.id, ok: false, error: job.error, code: 'INVALID_INPUT' })
        continue
      }
      if (cancelRequested.has(job.id)) {
        report({ id: job.id, status: 'canceled' })
        results.push({ id: job.id, ok: false, error: t('canceled'), code: 'CANCELED' })
        continue
      }
      report({ id: job.id, status: 'converting' })
      const result = await convertFile(job.input, job.output, {
        onSpawn: cancel => activeCancels.set(job.id, cancel)
      })
      activeCancels.delete(job.id)
      if (result.code === 'CANCELED') {
        report({ id: job.id, status: 'canceled' })
        results.push({ id: job.id, ...result })
        continue
      }
      if (result.ok) {
        report({ id: job.id, status: 'done', output: result.output, outputDir: path.dirname(result.output), bytes: result.bytes })
      } else {
        report({ id: job.id, status: 'error', error: result.error, code: result.code })
      }
      results.push({ id: job.id, ...result })
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, planned.length) }, worker))
  return results
}

// Marks a job canceled whether or not it has spawned yet: a job already running
// is killed, one still queued is skipped when the worker reaches it.
function requestCancel (id) {
  cancelRequested.add(id)
  const cancel = activeCancels.get(id)
  if (cancel) cancel()
}

// Called both before and after a batch: a cancel click landing just as the
// previous batch ended would otherwise carry over to the next one.
function resetCancels () {
  cancelRequested.clear()
  activeCancels.clear()
}

module.exports = { SUPPORTED_EXTENSIONS, planJobs, runQueue, requestCancel, resetCancels }
