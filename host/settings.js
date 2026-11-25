/**
 * Settings API for the plugin's own profile row, plus the two channels the
 * waiting banner needs: which session the page is showing, and which session the
 * banner asked to open.
 */

const PREFIX = '/dont-guess-api'
const MAX_BODY_BYTES = 8 * 1024

/** Policy modes the page may select; anything else is rejected. */
export const MODES = ['balanced', 'strict', 'light']

/** Banner anchors the page may select. */
export const POSITIONS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right']

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

async function writeConfig(ctx, patch) {
  const entry = ctx.fiber === undefined ? undefined : ctx.fiber.entry
  const editor = ctx.get('configEditor')
  if (entry === undefined || editor === undefined) {
    throw httpError('这个 profile 不支持在页面上保存插件配置', 501)
  }
  await editor.edit(entry, (current, inherited) => {
    const base = current !== null && typeof current === 'object' ? current : inherited
    return { ...base, ...patch }
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
 * @param read live settings and channels; every member is optional
 * @returns the route disposer
 */
export function registerSettingsApi(ctx, pluginCtx, read) {
  const handle = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname.slice(PREFIX.length) || '/'
    if (typeof read.apiHost === 'function') read.apiHost(req.headers.host)

    if (req.method === 'GET' && path === '/state') {
      sendJson(res, 200, {
        ok: true,
        data: {
          mode: read.mode(),
          position: read.position(),
          pendingAsks: typeof read.pendingCount === 'function' ? read.pendingCount() : 0,
        },
      })
      return
    }

    if (req.method === 'POST' && path === '/active') {
      const body = await readJson(req)
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
      if (sessionId === '') throw httpError('缺少 sessionId', 400)
      if (typeof read.activeSession === 'function') {
        read.activeSession({
          sessionId,
          ...typeof body.focused === 'boolean' ? { focused: body.focused } : {},
          ...typeof body.visible === 'boolean' ? { visible: body.visible } : {},
        }, req.headers.host)
      }
      sendJson(res, 200, { ok: true, data: { sessionId } })
      return
    }

    if (req.method === 'GET' && path === '/focus') {
      const sessionId = typeof read.focus?.wait === 'function' ? await read.focus.wait(20000) : ''
      sendJson(res, 200, { ok: true, data: { sessionId } })
      return
    }

    if (req.method === 'POST' && path === '/focus') {
      if (!sameOrigin(req)) {
        fail(res, 403, '拒绝跨站跳转')
        return
      }
      const body = await readJson(req)
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
      if (sessionId !== '' && typeof read.focus?.push === 'function') read.focus.push(sessionId)
      sendJson(res, 200, { ok: true, data: { sessionId } })
      return
    }

    if (req.method === 'POST' && (path === '/mode' || path === '/position')) {
      if (!sameOrigin(req)) {
        fail(res, 403, '拒绝跨站修改配置')
        return
      }
      const pending = typeof read.pendingCount === 'function' ? read.pendingCount() : 0
      if (pending > 0) {
        fail(res, 409, `还有 ${pending} 个问题在等回答，先答完再改设置`)
        return
      }
      const body = await readJson(req)
      if (path === '/mode') {
        const mode = typeof body.mode === 'string' ? body.mode : ''
        if (!MODES.includes(mode)) throw httpError(`未知的提问频率：${mode || '（空）'}`, 400)
        await writeConfig(pluginCtx, { mode })
        sendJson(res, 200, { ok: true, data: { mode, position: read.position() } })
        return
      }
      const position = typeof body.position === 'string' ? body.position : ''
      if (!POSITIONS.includes(position)) throw httpError(`未知的横幅位置：${position || '（空）'}`, 400)
      await writeConfig(pluginCtx, { bannerPosition: position })
      sendJson(res, 200, { ok: true, data: { mode: read.mode(), position } })
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
