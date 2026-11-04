import { cloneShareMessage, visibleAssistantElements } from './card.ts'
import type { ShareMessage } from './content.ts'
import type { ShareSettings } from './settings.ts'
import { applyHtmlExportTheme } from './export-theme.ts'
import { HTML_STYLE } from './html-style.ts'
import { replaceGenuiWithImages } from './static-genui.ts'

/**
 * 独立 HTML 导出器。对照 DSH 0.2.0-rc.2 客户端源码实现：
 * - 输入是官方 data-chat-flow-kind 座位快照（ShareMessage），输出无脚本、可离线阅读的单文件文档；
 * - 会话流渲染为 main > section.user/.assistant > .content，与官方消息座位一一对应；
 * - 用户气泡与助手正文沿用官方 MessageItem / markdown 渲染层的排版规则（见 html-style.ts）；
 * - 白名单净化：不复制宿主脚本、交互控件、内联样式或认证链接，只保留公共阅读所需的最小语义。
 */

const TAGS = new Set('div p span br hr h1 h2 h3 h4 h5 h6 strong b em i u s del blockquote pre code ul ol li table thead tbody tfoot tr th td caption a sub sup details summary section time'.split(' '))
const DROP = new Set('script style link meta base iframe object embed form input button textarea select template svg canvas audio video source'.split(' '))
const IMAGE_TYPE = /^image\/(png|jpeg|gif|webp|avif)$/i
const IMAGE_PROTOCOLS = new Set(['http:', 'https:', 'blob:', 'data:', 'dsh-app:'])
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_TOTAL_BYTES = 32 * 1024 * 1024
const MAX_IMAGE_COUNT = 100
const EMBED_DEADLINE_MS = 30000
const FETCH_TIMEOUT_MS = 10000

/** 只保留普通外部链接，排除宿主地址和携带认证参数的链接。 */
function publicLink(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[|0\.)/i.test(url.hostname)
      || !url.hostname.includes('.') || /\.(local|internal)$/i.test(url.hostname)) return
    if ([...url.searchParams.keys()].some(key => /token|secret|auth|key|signature|credential/i.test(key))) return
    return url.href
  } catch { return }
}

interface Snapshot {
  role: ShareMessage['role']
  omittedBefore: number
  elements: HTMLElement[]
}

/** 在异步资源读取前固定选择内容，避免宿主更新改变导出结果。 */
function snapshotMessages(messages: readonly ShareMessage[], locale: 'zh' | 'en', settings: ShareSettings): Snapshot[] {
  return messages.map(message => ({
    role: message.role,
    omittedBefore: message.omittedBefore,
    elements: (message.role === 'assistant'
      ? visibleAssistantElements(message.elements, settings.hideProcess) : message.elements)
      .map(element => cloneShareMessage(element, locale, message.role === 'assistant' && settings.hideProcess)),
  }))
}

/** 把分页 PNG 之外的安全表情/正文图片尺寸映射为导出 class。 */
function imageClass(source: Element): string | undefined {
  if (source.hasAttribute('data-dsh-share-genui')) return 'genui'
  const height = Number.parseFloat(source.getAttribute('height') ?? (source as HTMLElement).style?.height ?? '')
  if ((height > 0 && height <= 64) || source.getAttribute('src')?.includes('/api/dsh-emoji/assets/')) return 'emoji'
  return undefined
}

interface ImageCacheEntry {
  data: string
  size: number
}

/** 限时限量读取栅格图片并转为 data URL；重复地址复用缓存，不携带跨站认证信息或保留资源地址。 */
class ImageEmbedder {
  missing = 0
  private readonly cache = new Map<string, ImageCacheEntry>()
  private totalBytes = 0
  private imageCount = 0
  private readonly deadline = Date.now() + EMBED_DEADLINE_MS

  constructor(
    private readonly output: Document,
    private readonly baseUri: string,
    private readonly locale: 'zh' | 'en',
  ) {}

  async embed(source: Element): Promise<Node> {
    const image = this.output.createElement('img')
    image.alt = source.getAttribute('alt') ?? ''
    try {
      const raw = source.getAttribute('src') ?? ''
      const url = new URL(raw, this.baseUri)
      if (!raw || !IMAGE_PROTOCOLS.has(url.protocol)) throw new Error('Unsupported image')
      if (url.username || url.password || ++this.imageCount > MAX_IMAGE_COUNT) throw new Error('Image budget exceeded')
      const entry = await this.readRasterImage(url)
      if (this.totalBytes + entry.size > MAX_TOTAL_BYTES) throw new Error('Image budget exceeded')
      this.totalBytes += entry.size
      image.src = entry.data
      const className = imageClass(source)
      if (className) image.className = className
      return image
    } catch {
      this.missing++
      return this.missingPlaceholder()
    }
  }

  private async readRasterImage(url: URL): Promise<ImageCacheEntry> {
    const cached = this.cache.get(url.href)
    if (cached) return cached
    const remaining = this.deadline - Date.now()
    if (remaining <= 0) throw new Error('Image deadline exceeded')
    const response = await fetch(url.href, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      signal: AbortSignal.timeout(Math.min(FETCH_TIMEOUT_MS, remaining)),
    })
    const type = response.headers.get('content-type')?.split(';')[0] ?? ''
    if (!response.ok || !IMAGE_TYPE.test(type) || !response.body) throw new Error('Unsupported image')
    const reader = response.body.getReader()
    const chunks: Uint8Array<ArrayBuffer>[] = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > MAX_IMAGE_BYTES || this.totalBytes + size > MAX_TOTAL_BYTES) throw new Error('Image budget exceeded')
        chunks.push(new Uint8Array(value))
      }
    } finally { await reader.cancel() }
    const data = await encodeDataUrl(new Blob(chunks, { type }))
    const entry = { data, size }
    this.cache.set(url.href, entry)
    return entry
  }

  private missingPlaceholder(): HTMLElement {
    const placeholder = this.output.createElement('span')
    placeholder.className = 'notice'
    placeholder.textContent = this.locale === 'zh' ? '[图片未能内嵌]' : '[Image could not be embedded]'
    return placeholder
  }
}

function encodeDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Image encoding failed'))
    reader.readAsDataURL(blob)
  })
}

/**
 * 官方 hashed 类名含 header/title/time/body/explanation 片段，按片段映射触发器内部结构；
 * 代码块容器在导出里保留官方 md-code-block 语义（样式表对 .md-code-block/.code-block 同规则），
 * 思考块、横幅使用稳定的 data-* 属性识别。
 */
function exportClassName(source: Element): string | undefined {
  if (source.hasAttribute('data-code-block-banner')) return 'code-banner'
  if (source.classList.contains('md-code-block')) return 'md-code-block'
  if (source.classList.contains('md-table-wide')) return 'md-table-wide'
  if (source.getAttribute('data-variant') === 'think') return 'reasoning'
  const trigger = source.closest('[data-turn-trigger]')
  if (trigger === source) return 'turn-trigger'
  if (trigger) {
    if (/(^|_)(header)/.test(source.className)) return 'trigger-header'
    if (/(^|_)(title)/.test(source.className)) return 'trigger-title'
    if (/(^|_)(time)/.test(source.className)) return 'trigger-time'
    if (/(^|_)(explanation)/.test(source.className)) return 'trigger-explanation'
    if (/(^|_)(body)/.test(source.className)) return 'trigger-body'
  }
  return undefined
}

/** 从不复制宿主属性、内联样式或可执行节点。 */
async function sanitizeNode(output: Document, node: Node, embedder: ImageEmbedder): Promise<Node> {
  if (node.nodeType === 3) return output.createTextNode(node.textContent ?? '')
  if (node.nodeType !== 1) return output.createDocumentFragment()
  const source = node as Element
  const tag = source.localName.toLowerCase()
  if (DROP.has(tag)) return output.createDocumentFragment()
  if (tag === 'img') return embedder.embed(source)
  const result = TAGS.has(tag) ? output.createElement(tag) : output.createDocumentFragment()
  if (result.nodeType === 1) {
    const element = result as HTMLElement
    const className = exportClassName(source)
    if (className) element.className = className
    if (tag === 'span' && source.closest('pre')) {
      // 代码高亮只保留安全的颜色值，其余内联样式一律不进入导出结果。
      const color = (source as HTMLElement).style.color
      if (/^(?:#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)$/i.test(color)) element.style.color = color
    }
    if (tag === 'a') {
      const href = publicLink(source.getAttribute('href') ?? '')
      if (href) element.setAttribute('href', href)
    }
    if (tag === 'td' || tag === 'th') {
      for (const attribute of ['colspan', 'rowspan']) {
        const value = source.getAttribute(attribute)
        if (value && /^\d{1,3}$/.test(value)) element.setAttribute(attribute, value)
      }
    }
  }
  for (const child of source.childNodes) result.appendChild(await sanitizeNode(output, child, embedder))
  if (tag === 'table') {
    // 官方语义：≤3 列或位于引用内的表格铺满列宽，多列表格按内容宽横向滚动。
    const wrapper = output.createElement('div')
    const columnCount = Math.max(...[...result.querySelectorAll('tr')]
      .map(row => row.children.length), 0)
    wrapper.className = 'table-scroll'
    if (columnCount > 3) wrapper.classList.add('table-wide')
    else wrapper.classList.add('table-fill')
    wrapper.append(result)
    return wrapper
  }
  return result
}

/** 生成无脚本的独立阅读文档；只复制允许的标签和属性。 */
export async function createShareHtml(
  document: Document,
  messages: readonly ShareMessage[],
  locale: 'zh' | 'en',
  settings: ShareSettings,
): Promise<{ html: string, missingImages: number }> {
  const output = document.implementation.createHTMLDocument(locale === 'zh' ? '对话分享' : 'Shared conversation')
  output.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'

  const charset = output.createElement('meta')
  charset.setAttribute('charset', 'utf-8')
  const csp = output.createElement('meta')
  csp.httpEquiv = 'Content-Security-Policy'
  csp.content = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"
  const viewport = output.createElement('meta')
  viewport.name = 'viewport'
  viewport.content = 'width=device-width, initial-scale=1'
  const style = output.createElement('style')
  style.textContent = HTML_STYLE
  output.head.prepend(charset, csp, viewport, style)

  const main = output.createElement('main')
  main.ariaLabel = output.title
  // 在脱离宿主前保存主题令牌快照，离线后仍保持会话配色。
  applyHtmlExportTheme(output.body, messages.flatMap(message => message.elements))
  output.body.append(main)

  const snapshots = snapshotMessages(messages, locale, settings)
  for (const message of snapshots) {
    for (const element of message.elements) await replaceGenuiWithImages(element, locale, settings)
  }

  const embedder = new ImageEmbedder(output, document.baseURI, locale)
  for (const message of snapshots) {
    if (message.omittedBefore > 0) {
      const omission = output.createElement('p')
      omission.className = 'notice'
      omission.textContent = locale === 'zh' ? `中间省略 ${message.omittedBefore} 组对话` : `${message.omittedBefore} conversation groups omitted`
      main.append(omission)
    }
    const section = output.createElement('section')
    section.className = message.role
    section.ariaLabel = message.role === 'user' ? locale === 'zh' ? '用户' : 'User' : 'DeepSeek'
    const content = output.createElement('div')
    // 官方正文容器：助手回答走 MarkdownText 规则（.markdown），用户气泡自带 pre-wrap。
    content.className = message.role === 'assistant' ? 'content markdown' : 'content'
    for (const element of message.elements) content.append(await sanitizeNode(output, element, embedder))
    section.append(content)
    main.append(section)
  }
  return { html: `<!doctype html>\n${output.documentElement.outerHTML}`, missingImages: embedder.missing }
}
