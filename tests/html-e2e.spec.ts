// @vitest-environment jsdom
/**
 * 端到端验证：模拟真实 DSH 会话 DOM（官方 data-chat-flow-kind 座位结构），
 * 走完整导出管线（快照 → 克隆 → 净化 → 内嵌 → 主题快照），检查产物 HTML 的
 * 结构、样式、内嵌图片与安全属性，并真实落盘供人工浏览器复核。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { createShareHtml } from '../src/client/html.ts'
import { selectedTurnsToShareMessages, type SelectedTurn } from '../src/client/content.ts'
import { DEFAULT_SHARE_SETTINGS } from '../src/client/settings.ts'
import { HTML_STYLE } from '../src/client/html-style.ts'

const toPng = vi.hoisted(() => vi.fn())
vi.mock('html-to-image', () => ({ toPng }))

/** 构造一段贴近 DSH 实际渲染的多轮会话座位 DOM。 */
function buildTurn(id: number, question: string, answerHtml: string, opts: { think?: string, tool?: string } = {}): SelectedTurn {
  const wrap = (kind: string, html: string): HTMLElement => {
    const element = document.createElement('div')
    element.dataset.chatFlowKind = kind
    element.innerHTML = html
    return element
  }
  const prompts = [wrap('user', `<p>${question}</p>`)]
  const answers: HTMLElement[] = []
  if (opts.think) answers.push(wrapWithThink(opts.think))
  if (opts.tool) answers.push(buildToolCall(opts.tool))
  answers.push(wrap('assistant-step', answerHtml))
  const tail = document.createElement('div')
  tail.dataset.chatFlowKind = 'turn-tail'
  return { content: { prompts, answers, segments: [{ prompts, answers }], tail }, id: String(id), turn: id }
}

function wrapWithThink(reasoning: string): HTMLElement {
  const element = document.createElement('div')
  element.dataset.chatFlowKind = 'assistant-step'
  element.innerHTML = `<div data-variant="think">${reasoning}</div><p>推理完成</p>`
  return element
}

function buildToolCall(command: string): HTMLElement {
  const element = document.createElement('div')
  element.dataset.chatFlowKind = 'tool-call'
  element.innerHTML = `<div data-disclosure-row><span>pwsh</span><span data-sample="bash">${command}</span></div>`
  return element
}

function codeBlockElement(lang: string, code: string): string {
  return `<div class="md-code-block"><div data-code-block-banner>${lang}<button>复制</button></div><pre><code><span style="color:rgb(12,34,56)">const</span> x = 1</code></pre></div>`
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  toPng.mockReset()
})

describe('端到端：真实会话导出 HTML', () => {
  it('多轮会话完整导出：座位结构、思考块、工具摘要、代码、表格、图片、省略提示', async () => {
    const turn1 = buildTurn(1, '你好，介绍一下这个项目', '<p>这是一个 <strong>DSH 分享插件</strong>，支持导出多种格式。</p><ul><li>图片</li><li>Markdown</li></ul>', { think: '用户想要项目介绍', tool: 'Get-Process' })
    const turn2 = buildTurn(2, '给我一段代码', `<p>示例如下：</p>${codeBlockElement('TS', '')}<table><tr><th>格式</th><th>说明</th></tr><tr><td>HTML</td><td>离线阅读</td></tr></table><p><img src="https://example.org/chart.png" height="24" alt="图表"> 完毕。</p>`)
    // 第一组与第三组之间省略了 turn 3？不：turn 1 → turn 2 连续，无省略。
    const messages = selectedTurnsToShareMessages([turn1, turn2])

    const fetcher = vi.fn(async () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } }))
    vi.stubGlobal('fetch', fetcher)

    const result = await createShareHtml(document, messages, 'zh', DEFAULT_SHARE_SETTINGS)

    // 产物写入磁盘，供浏览器人工复核
    mkdirSync('e2e-output', { recursive: true })
    writeFileSync('e2e-output/share-sample.html', result.html, 'utf8')

    const parsed = new DOMParser().parseFromString(result.html, 'text/html')

    // 文档骨架
    expect(parsed.doctype).not.toBeNull()
    expect(parsed.documentElement.lang).toBe('zh-CN')
    expect(parsed.querySelector('meta[charset="utf-8"]')).not.toBeNull()
    expect(parsed.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute('content')).toContain("default-src 'none'")
    expect(parsed.querySelector('style')!.textContent).toBe(HTML_STYLE)
    expect(parsed.querySelector('main')!.getAttribute('aria-label')).toBe('对话分享')

    // 四条消息段落：user/assistant × 2 轮
    const sections = [...parsed.querySelectorAll('main > section')]
    expect(sections).toHaveLength(4)
    expect(sections[0]!.className).toBe('user')
    expect(sections[1]!.className).toBe('assistant')
    expect(sections[0]!.getAttribute('aria-label')).toBe('用户')
    expect(sections[1]!.getAttribute('aria-label')).toBe('DeepSeek')

    // 内容保真
    const text = parsed.body.textContent ?? ''
    expect(text).toContain('你好，介绍一下这个项目')
    expect(text).toContain('DSH 分享插件')
    expect(text).toContain('推理完成')
    expect(parsed.querySelector('[data-variant="think"], .reasoning')).not.toBeNull()
    expect(text).toContain('pwsh') // 工具摘要保留
    expect(text).toContain('const') // 代码保留
    expect(parsed.querySelector('.code-banner')!.textContent).toContain('TS')
    expect(parsed.querySelector('.code-block pre')).not.toBeNull()
    expect(parsed.querySelector('.table-scroll > table')).not.toBeNull()
    expect(parsed.querySelectorAll('td')).toHaveLength(2)

    // 图片内嵌为 data URL 且标记 emoji 尺寸
    const image = parsed.querySelector('img')!
    expect(image.getAttribute('src')).toMatch(/^data:image\/png;base64,/)
    expect(image.className).toBe('emoji')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' })
    expect(result.missingImages).toBe(0)

    // 安全：无脚本/按钮/事件属性/原始外链残留
    expect(parsed.querySelectorAll('script,iframe,button,svg,canvas')).toHaveLength(0)
    expect(result.html).not.toMatch(/onclick|onerror|javascript:/)

    // 主元素未被修改
    expect(turn1.content.prompts[0]!.textContent).toContain('你好，介绍一下这个项目')
  })

  it('hideProcess 模式隐藏思考与工具摘要，多组省略正确渲染', async () => {
    const turn1 = buildTurn(1, '问题 A', '<p>回答 A</p>', { think: '思考内容', tool: 'Get-Process' })
    const turn3 = buildTurn(3, '问题 C', '<p>回答 C</p>')
    const messages = selectedTurnsToShareMessages([turn1, turn3])

    const result = await createShareHtml(document, messages, 'zh', { ...DEFAULT_SHARE_SETTINGS, hideProcess: true })
    const text = new DOMParser().parseFromString(result.html, 'text/html').body.textContent ?? ''
    expect(text).toContain('问题 A')
    expect(text).toContain('回答 A')
    expect(text).toContain('问题 C')
    expect(text).toContain('回答 C')
    expect(text).not.toContain('思考内容')
    expect(text).not.toContain('Get-Process')
    expect(text).toContain('中间省略 1 组对话')
  })

  it('GenUI 块静态化为内嵌图，失败图片给出占位并计数', async () => {
    toPng.mockResolvedValue('data:image/png;base64,AQID')
    const turn = buildTurn(1, '看组件', '<div data-genui-artifact><div data-genui><strong>仪表盘</strong><svg><path/></svg></div></div>')
    turn.content.answers[0]!.querySelector('[data-genui]')!.setAttribute('data-dsh-share-genui', '')
    const failing = buildTurn(2, '看图', '<p><img src="https://example.org/broken.png" alt="挂了"></p>')
    const messages = selectedTurnsToShareMessages([turn, failing])

    // data: URL（GenUI 静态图）走真实 fetch，http 请求模拟断网。
    const realFetch = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.startsWith('data:')) return realFetch(url)
      throw new Error('Network unavailable')
    }))
    const result = await createShareHtml(document, messages, 'zh', DEFAULT_SHARE_SETTINGS)
    const parsed = new DOMParser().parseFromString(result.html, 'text/html')

    expect(parsed.querySelector('img.genui')!.src).toBe('data:image/png;base64,AQID')
    expect(parsed.querySelector('svg')).toBeNull()
    expect(parsed.body.textContent).toContain('[图片未能内嵌]')
    expect(result.missingImages).toBe(1)
    expect(result.html).not.toContain('broken.png')

    writeFileSync('e2e-output/share-sample-missing.html', result.html, 'utf8')
  })
})
