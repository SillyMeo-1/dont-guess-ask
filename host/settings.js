/**
 * Settings API for the plugin's own profile row.
 *
 * The settings page chooses one policy mode. The write goes through the
 * profile's config editor: it persists an override row in the profile patch and
 * reloads this plugin, so the new policy applies to the next request.
 */

const PREFIX = '/dont-guess-api'
const MAX_BODY_BYTES = 8 * 1024

/** Policy modes the page may select; anything else is rejected. */
export const MODES = ['balanced', 'strict', 'light']

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

function fail(res, status, message) {
  sendJson(res, status, { ok: false, error: { message } })
}

function httpError(message, status) {
  return Object.assign(new Error(message), { status })
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.byteLength
    if (size > MAX_BODY_BYTES) throw httpError('请求体过大', 413)
    chunks.push(chunk)
  }
  if (size === 0) return {}
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return parsed !== null && typeof parsed === 'object' ? parsed : {}
  } catch {
    throw httpError('请求体不是合法 JSON', 400)
  }
}

async function writeMode(ctx, mode) {
  const entry = ctx.fiber === undefined ? undefined : ctx.fiber.entry
  const editor = ctx.get('configEditor')
  if (entry === undefined || editor === undefined) {
    throw httpError('这个 profile 不支持在页面上保存插件配置', 501)
  }
  await editor.edit(entry, (current, inherited) => {
    const base = current !== null && typeof current === 'object' ? current : inherited
    return { ...base, mode }
  })
}

function sameOrigin(req) {
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin === '') return true
  const host = req.headers.host
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/**
 * Register `/dont-guess-api` on the composition's web server.
 * @param ctx context that has `webServer`
 * @param pluginCtx the plugin's own context, whose fiber owns the profile row
 * @param read live policy mode
 * @returns the route disposer
 */
export function registerSettingsApi(ctx, pluginCtx, read) {
  const handle = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname.slice(PREFIX.length) || '/'
    if (req.method === 'GET' && path === '/state') {
      sendJson(res, 200, { ok: true, data: { mode: read() } })
      return
    }
    if (req.method === 'POST' && path === '/mode') {
      if (!sameOrigin(req)) {
        fail(res, 403, '拒绝跨站修改配置')
        return
      }
      const body = await readJson(req)
      const mode = typeof body.mode === 'string' ? body.mode : ''
      if (!MODES.includes(mode)) throw httpError(`未知的提问频率：${mode || '（空）'}`, 400)
      await writeMode(pluginCtx, mode)
      sendJson(res, 200, { ok: true, data: { mode } })
      return
    }
    fail(res, 404, '未知接口')
  }
  return ctx.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: (req, res) => {
      handle(req, res).catch((error) => {
        if (res.headersSent) {
          res.end()
          return
        }
        const status = Number(error?.status) || 500
        fail(res, status, error instanceof Error ? error.message : String(error))
      })
    },
  })
}
