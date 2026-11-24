/**
 * 我不猜会问你 — Host half.
 *
 * Three contributions: a standing instruction that prefers a choice over a
 * guess, the `dont_guess_ask` tool that turns one inferred requirement into a
 * selection card through `ctx.userQuestions`, and the settings route that lets
 * the Web page switch the policy mode. The card is the host's own question
 * composer, so the plugin owns no question UI of its own.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MODES, registerSettingsApi } from './host/settings.js'

export const name = 'dont-guess-ask'

export const inject = ['tools', 'systemPrompt', 'userQuestions']

/** The tool the policy text points at. */
const TOOL_NAME = 'dont_guess_ask'

/** Question id echoed in the answer batch. */
const QUESTION_ID = 'requirement'

/** Fallback tag above the question card. */
const HEADER_DEFAULT = '需求确认'

const TOOL_DESCRIPTION = '把「你推断出的需求」做成选择框让用户选，代替自己猜着往下做。'
  + '用户选定的那份理解就是本次要做的需求；他也可以自己写一句，覆盖所有候选。'

const POLICIES = {
  balanced: [
    '## 别猜需求，先让用户选',
    '用户常只丢一句话，剩下的形状要你自己补。补可以，但当你正要按一种**用户没明说**的理解动手时，'
      + '先用 `dont_guess_ask` 把推断出的几种需求摆出来让他挑，再继续。判据只有一条：猜错了，用户能看见的成果要不要重做。',
    '',
    '先问的情形：',
    '- 同一句话有多个合理解读，选错要返工；',
    '- 你要替用户定一件他可能在意、却没说的事：范围、风格、格式、技术选型、放在哪、要不要兼容旧数据；',
    '- 你的计划里冒出「我默认」「我理解为」「应该是想让我……吧」这种句子。',
    '',
    '不必问的情形：',
    '- 用户已经说清的部分，不要反问；',
    '- 答案能在仓库、文档、配置或现有代码里查到——先去查，再决定要不要问；',
    '- 只是琐碎、可逆、几乎零成本的选择——自己定，顺手说一句。',
    '',
    '怎么问：一次只问真正卡住你的那一个点，能并进同一张卡的别拆成两张；同一个点问过一次就按结果做，别再问第二遍。'
      + '需求确认用 `dont_guess_ask`，不要再用 `ask_user_question` 代劳。用用户的语言写问题和选项。',
  ].join('\n'),
  strict: [
    '## 别猜需求，先让用户选（严格）',
    '成品里凡是出现用户没说、由你替他定的东西，先问再动手：用 `dont_guess_ask` 把 2–5 种读法摆出来让他挑。'
      + '宁可多问一句，也别按推测返工。',
    '',
    '仍然不必问：用户已说清的部分；能先在代码、文档、配置里查到的；用户明确让你自己拿主意的小事。',
    '',
    '同一个点只问一次；需求确认用 `dont_guess_ask`，不要再用 `ask_user_question` 代劳。一次只问一个点；用用户的语言写。',
  ].join('\n'),
  light: [
    '## 别猜需求，先让用户选（轻量）',
    '只在方向本身分叉时用 `dont_guess_ask`：有两个以上明显不同的做法，选错会推翻整块工作。',
    '细节、默认值、实现风格这类可回退的选择自己定，并在结果里说明，不要为它们弹框。',
    '',
    '同一个点只问一次；用用户的语言写。',
  ].join('\n'),
}

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    status: {
      type: 'string',
      enum: ['picked', 'custom', 'skipped', 'cancelled', 'delegated', 'unavailable', 'failed'],
      description: 'How the ask ended: a chosen candidate, the user\'s own wording, a skip, a closed card, a delegated caller, no answer surface, or an error.',
    },
    picked: { type: 'array', items: { type: 'string' } },
    custom: { type: 'string' },
    reason: { type: 'string' },
  },
}

/** Register the policy section, the tool, and the settings route. */
export function apply(ctx, config = {}) {
  const settings = resolveSettings(config)
  if (isRecord(config) && typeof config.mode === 'string' && config.mode !== '' && !MODES.includes(config.mode)) {
    ctx.logger?.warn?.(`dont-guess-ask: 未知的提问频率 "${config.mode}"，已按 balanced 处理`)
  }
  ctx.effect(
    () => ctx.systemPrompt.section({
      name: 'dont-guess:policy',
      order: 400,
      text: settings.policy,
    }),
    'dont-guess-ask: policy section',
  )
  ctx.effect(
    () => ctx.tools.register(createTool(ctx, settings)),
    'dont-guess-ask: tool',
  )
  // The settings page is optional: a composition without a web server still
  // gets the rule and the tool.
  ctx.inject(['webServer'], webCtx => {
    webCtx.effect(
      () => registerSettingsApi(webCtx, ctx, () => settings.mode),
      'dont-guess-ask: settings api',
    )
  })
}

function createTool(ctx, settings) {
  return {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['guess', 'question', 'options'],
      properties: {
        guess: {
          type: 'string',
          description: '你本来打算采用的理解。会原样显示在问题下方，写成「我猜你要的是：…」这种用户能直接读懂的句子，用用户的语言。',
        },
        question: {
          type: 'string',
          description: '要用户拍板的那个点，一句话。',
        },
        options: {
          type: 'array',
          minItems: 2,
          maxItems: 5,
          description: '2–5 个候选理解，按推荐程度排序：第一个是你推荐的做法，标签末尾加「（推荐）」。',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['label'],
            properties: {
              label: { type: 'string', minLength: 1, description: '候选理解的短标签，一行能读完。' },
              description: { type: 'string', description: '这个理解会导致什么结果或代价，一句话。' },
            },
          },
        },
      },
    },
    output: {
      schema: RESULT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: describeResult(value) }],
    },
    presentCall(args) {
      const question = readText(isRecord(args) ? args.question : undefined)
      return { card: 'generic', title: question === '' ? '需求确认' : question, kind: 'other' }
    },
    execute(args, exec) {
      return run(ctx, settings, args, exec)
    },
  }
}

async function run(ctx, settings, args, exec) {
  const question = readText(isRecord(args) ? args.question : undefined)
  const guess = readText(isRecord(args) ? args.guess : undefined)
  const options = readOptions(isRecord(args) ? args.options : undefined)
  if (question === '') throw new Error('question 为空：写清要用户拍板的那一个点。')
  if (options.length < 2) throw new Error('options 少于 2 个：把用户可能想要的另一种理解也列出来。')
  if (options.length > 5) throw new Error('options 超过 5 个：只留最可能的 5 个，推荐项排第一。')

  const stopBanner = startWaitBanner(ctx, exec, settings)
  let answer
  try {
    answer = await ctx.userQuestions.ask({
      questions: [{
        id: QUESTION_ID,
        question,
        header: settings.header,
        ...guess === '' ? {} : { detail: guess },
        options,
      }],
      ...exec.agent === undefined ? {} : { agent: exec.agent },
      signal: exec.signal,
    })
  } catch (error) {
    return fromFailure(error, exec.signal)
  } finally {
    stopBanner?.()
  }
  return fromAnswer(answer)
}

/** Path of the WinForms banner that marks a question waiting outside the app. */
function bannerScript() {
  return join(dirname(fileURLToPath(import.meta.url)), 'host', 'wait-banner.ps1')
}

/** The asking session's title, or '' when its projection is unavailable. */
function sessionTitleOf(ctx, exec) {
  try {
    const session = exec?.agent?.session
    if (session === undefined) return ''
    const projections = ctx.get?.('sessionProjections')
    if (projections === undefined || typeof projections.snapshot !== 'function') return ''
    const value = projections.snapshot(session, ['title'])?.values?.title
    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  }
}

/**
 * Raise a top-of-screen banner while the question waits and the person is not
 * looking at this session: the app is minimized, behind another window, or its
 * window title names a different session. The banner never takes focus, and a
 * click brings the app forward. Best effort: a failed banner never fails the ask.
 * @returns a disposer, or undefined when the banner is disabled or unavailable.
 */
function startWaitBanner(ctx, exec, settings) {
  if (settings.waitBanner === false) return undefined
  const title = sessionTitleOf(ctx, exec)
  const directory = join(tmpdir(), 'dsh-wait-ask')
  let paramsPath
  let stopPath
  let child
  try {
    mkdirSync(directory, { recursive: true })
    const token = `${Date.now().toString(36)}-${process.pid.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    paramsPath = join(directory, `params-${token}.json`)
    stopPath = join(directory, `stop-${token}.txt`)
    writeFileSync(paramsPath, JSON.stringify({
      pid: process.pid,
      titleMatch: title,
      text: settings.bannerText,
      subtext: title === '' ? '点这里回到 DSH' : `会话：${title}`,
      stopFile: stopPath,
      delayMs: settings.bannerDelayMs,
      pollMs: 600,
    }), 'utf8')
    child = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-WindowStyle', 'Hidden', '-File', bannerScript(), '-ParamsPath', paramsPath,
    ], { stdio: 'ignore', windowsHide: true })
    child.on('error', () => undefined)
    child.unref()
  } catch {
    return undefined
  }
  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    try {
      writeFileSync(stopPath, 'stop', 'utf8')
    } catch {
      // The kill below is the authoritative stop.
    }
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        // Already gone.
      }
      for (const file of [paramsPath, stopPath]) {
        try {
          rmSync(file, { force: true })
        } catch {
          // Best effort.
        }
      }
    }, 2000)
    timer.unref?.()
  }
}

function fromAnswer(answer) {
  const items = isRecord(answer) && Array.isArray(answer.answers) ? answer.answers : []
  const item = items.find(entry => isRecord(entry) && entry.id === QUESTION_ID)
  if (item === undefined) return { status: 'failed', reason: '回答里没有这一问的结果' }
  const custom = readText(item.custom)
  const picked = Array.isArray(item.selected)
    ? item.selected.filter(label => typeof label === 'string' && label !== '')
    : []
  if (custom !== '') return { status: 'custom', custom }
  if (picked.length > 0) return { status: 'picked', picked }
  return { status: 'skipped' }
}

function fromFailure(error, signal) {
  // A cancelled turn or tool call is not a plugin outcome: let it unwind.
  if (signal !== undefined && signal.aborted) throw error
  const code = isRecord(error) && typeof error.code === 'string' ? error.code : ''
  const message = error instanceof Error ? error.message : String(error)
  if (code === 'DELEGATED_CALLER') return { status: 'delegated', reason: message }
  if (code === 'ASK_CANCELLED') return { status: 'cancelled' }
  if (code === 'NO_PROVIDER' || code === 'CALLER_NOT_LIVE') {
    return { status: 'unavailable', reason: message }
  }
  return { status: 'failed', reason: message }
}

function describeResult(value) {
  const status = isRecord(value) ? value.status : undefined
  if (status === 'picked') {
    const picked = Array.isArray(value.picked) ? value.picked : []
    return `用户选了：「${picked.join('」「')}」。按这个执行，其它候选就此作废。`
      + '这个点已经定了：不要再用选择框问同一件事；只有新的、不同的不确定点才问。'
  }
  if (status === 'custom') {
    return `用户自己写了需求：「${readText(value.custom)}」。以这句为准，按它执行。`
      + '这个点已经定了：不要再用选择框问同一件事。'
  }
  if (status === 'skipped') {
    return '用户跳过了这次选择，也不想被再问一遍。按第一个候选（推荐）继续，并在回复里用一句话说明你采用了这个假设，方便他随时纠正。'
  }
  if (status === 'cancelled') {
    return '用户关掉了选择框，没做选择——通常是他想自己说，或现在不想定这个。停下来，'
      + '用一句话在正文里问他这块要怎么做；不要按任何候选继续，也不要马上重开同一张卡。'
  }
  if (status === 'delegated') {
    return '子代理不能直接弹选择框。先用第一个候选把其余能做的做完，然后在最终结果里单列「待确认：…（我暂按 X）」'
      + '交回调用你的那一层，由能弹框的代理去问用户。'
  }
  if (status === 'failed') {
    const reason = readText(value.reason)
    return `选择框出错了${reason === '' ? '' : `（${reason}）`}。别按猜测继续：用一句话告诉用户这次没能弹框，`
      + '并直接在正文里问那个点。'
  }
  const reason = isRecord(value) ? readText(value.reason) : ''
  return `选择框没弹出来${reason === '' ? '' : `（${reason}）`}。不要卡住：按第一个候选继续，`
    + '并在回复里说明这是你的假设；用户之后给出不同说法，以他为准。'
}

function readOptions(value) {
  if (!Array.isArray(value)) return []
  const options = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    const label = readText(entry.label)
    if (label === '') continue
    const description = readText(entry.description)
    options.push(description === '' ? { label } : { label, description })
  }
  return options
}

function readText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function resolveSettings(config) {
  const source = isRecord(config) ? config : {}
  const mode = typeof source.mode === 'string' && MODES.includes(source.mode) ? source.mode : 'balanced'
  const header = readText(source.header)
  const extra = readText(source.extraRule)
  const bannerText = readText(source.bannerText)
  const delay = Number(source.bannerDelayMs)
  return {
    mode,
    header: header === '' ? HEADER_DEFAULT : header,
    policy: extra === '' ? POLICIES[mode] : `${POLICIES[mode]}\n\n${extra}`,
    waitBanner: source.waitBanner !== false,
    bannerText: bannerText === '' ? '我还在等你回答' : bannerText,
    bannerDelayMs: Number.isFinite(delay) && delay >= 0 ? Math.min(Math.round(delay), 60000) : 1200,
  }
}
