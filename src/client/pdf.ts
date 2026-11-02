import { createDownloadFilename } from './filename.ts'

/**
 * 把 PNG 分页嵌入单文件 PDF：每页一个等比页面 + 一张整页图片。
 * 图片走 PDF 原生 PNG（FlateDecode + Predictor）路径，不做重排版，
 * 视觉结果与预览中的分页 PNG 逐像素一致。
 *
 * 带 Alpha 的 PNG（RGBA / 灰度+Alpha）不能整幅声明为 DeviceRGB/DeviceGray：
 * PDF 图像没有逐像素 alpha 通道，数据会按 3（或 1）分量错位解读、整页花屏。
 * 因此拆成两张流：主图只含颜色分量（DeviceRGB / DeviceGray），
 * /SMask 单独存 alpha（DeviceGray），渲染时按 alpha 合成，观感与 PNG 一致。
 */

// PNG 数据块标签，用于在不解析 zlib 流的前提下抽取 IDAT 原始字节。
const PNG_TYPE = new Uint8Array([0x49, 0x44, 0x41, 0x54])
const PNG_SIGNATURE = 0x89504e47

interface PngImage {
  /** IDAT 拼接后的 zlib 像素流（PNG 过滤行）。 */
  data: Uint8Array<ArrayBuffer>
  width: number
  height: number
  /** 0 灰度、2 RGB、4 灰度+Alpha、6 RGBA。 */
  colorType: number
}

interface PdfImage {
  width: number
  height: number
  colorSpace: '/DeviceGray' | '/DeviceRGB'
  /** 主图像素流：只含颜色分量，PNG 过滤行 + Flate。 */
  data: Uint8Array<ArrayBuffer>
  /** Predictor /Colors：灰度=1、RGB=3。 */
  colors: 1 | 3
  /** alpha 分离出的 SMask 流；不带 alpha 的 PNG 为 undefined。 */
  smask?: { data: Uint8Array<ArrayBuffer> }
}

interface PdfPage {
  image: PdfImage
}

function concatBytes(parts: readonly Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function asciiBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length)
  for (let index = 0; index < text.length; index++) out[index] = text.charCodeAt(index) & 0x7f
  return out
}

/** 逐块扫描 PNG，抽取 IHDR 元数据和 IDAT 像素流；非 PNG 输入返回 undefined。 */
export function parsePng(blob: ArrayBuffer): (PngImage & { colorType: number }) | undefined {
  const bytes = new Uint8Array(blob) as Uint8Array<ArrayBuffer>
  const view = new DataView(blob)
  if (bytes.length < 33 || view.getUint32(0) !== PNG_SIGNATURE) return undefined
  if (view.getUint32(12) !== 0x49484452) return undefined // IHDR
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  const colorType = view.getUint8(25)
  const interlace = view.getUint8(28)
  if (!width || !height || width > 32767 || height > 32767) return undefined
  // 隔行 PNG 的扫描线布局与 Predictor 期望不同；canvas.toBlob 不会产出隔行图，遇到即拒绝。
  if (interlace !== 0) return undefined
  if (!pngComponents(colorType)) return undefined
  const idat: Uint8Array<ArrayBuffer>[] = []
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset)
    if (length > bytes.length - offset - 12) break
    const type = bytes.subarray(offset + 4, offset + 8)
    if (type[0] === PNG_TYPE[0] && type[1] === PNG_TYPE[1] && type[2] === PNG_TYPE[2] && type[3] === PNG_TYPE[3]) {
      idat.push(bytes.subarray(offset + 8, offset + 8 + length))
    }
    const isEnd = type[0] === 0x49 && type[1] === 0x45 && type[2] === 0x4e && type[3] === 0x44
    offset += 12 + length
    if (isEnd) break
  }
  if (!idat.length) return undefined
  return { data: concatBytes(idat), width, height, colorType }
}

/** PNG 颜色类型 → 每像素分量数；不支持的颜色类型返回 undefined。 */
function pngComponents(colorType: number): 1 | 2 | 3 | 4 | undefined {
  switch (colorType) {
    case 0: return 1
    case 2: return 3
    case 4: return 2
    case 6: return 4
    default: return undefined
  }
}

/** 解压 PNG 过滤行并逐行还原（逆 PNG 过滤器），得到未过滤像素。 */
function pngUnfilter(raw: Uint8Array, width: number, height: number, components: number): Uint8Array<ArrayBuffer> {
  const stride = width * components
  const out = new Uint8Array(height * stride)
  let position = 0
  for (let row = 0; row < height; row++) {
    const filter = raw[position]!
    position += 1
    const current = out.subarray(row * stride, (row + 1) * stride)
    const previous = row > 0 ? out.subarray((row - 1) * stride, row * stride) : undefined
    for (let index = 0; index < stride; index++) {
      const rawByte = raw[position + index]!
      const left = index >= components ? current[index - components]! : 0
      const up = previous ? previous[index]! : 0
      const upLeft = previous && index >= components ? previous[index - components]! : 0
      let value: number
      if (filter === 1) value = rawByte + left
      else if (filter === 2) value = rawByte + up
      else if (filter === 3) value = rawByte + ((left + up) >> 1)
      else if (filter === 4) {
        const prediction = left + up - upLeft
        const pa = Math.abs(prediction - left)
        const pb = Math.abs(prediction - up)
        const pc = Math.abs(prediction - upLeft)
        value = rawByte + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)
      } else value = rawByte
      current[index] = value & 0xff
    }
    position += stride
  }
  return out
}

/** 把未过滤像素重组为 PNG 过滤行（每行 0 过滤字节），供重新 deflate。 */
function pngRefilter(pixels: Uint8Array, width: number, height: number, components: number): Uint8Array<ArrayBuffer> {
  const stride = width * components
  const out = new Uint8Array(height * (stride + 1))
  for (let row = 0; row < height; row++) {
    out[row * (stride + 1)] = 0
    out.set(pixels.subarray(row * stride, (row + 1) * stride), row * (stride + 1) + 1)
  }
  return out
}

/** zlib deflate；CompressionStream 缺失时（老环境）明确失败而不是产出坏页。 */
async function deflateBytes(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const CompressionStreamConstructor = globalThis.CompressionStream
  if (!CompressionStreamConstructor) throw new Error('CompressionStream unavailable')
  const stream = new CompressionStreamConstructor('deflate')
  const response = new Response(new Uint8Array(bytes))
  const compressed = new Response(response.body!.pipeThrough(stream))
  return new Uint8Array(await compressed.arrayBuffer()) as Uint8Array<ArrayBuffer>
}

/** zlib inflate；DecompressionStream 缺失时（老环境）明确失败而不是产出坏页。 */
async function inflateBytes(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const DecompressionStreamConstructor = globalThis.DecompressionStream
  if (!DecompressionStreamConstructor) throw new Error('DecompressionStream unavailable')
  const stream = new DecompressionStreamConstructor('deflate')
  const response = new Response(new Uint8Array(bytes))
  const decompressed = new Response(response.body!.pipeThrough(stream))
  return new Uint8Array(await decompressed.arrayBuffer()) as Uint8Array<ArrayBuffer>
}

/**
 * 把带 Alpha 的 PNG 拆成颜色流和 SMask 流：解压 → 逆 PNG 过滤 → 分离 alpha →
 * 重组过滤行 → 重新压缩。颜色流每像素 3（RGB）或 1（灰度）分量，SMask 每像素 1 分量。
 */
async function splitAlphaPng(image: PngImage, components: 2 | 4): Promise<PdfImage> {
  const colorComponents = components === 4 ? 3 : 1
  const pixels = pngUnfilter(await inflateBytes(image.data), image.width, image.height, components)
  const colorStride = image.width * colorComponents
  const colorPixels = new Uint8Array(image.height * colorStride)
  const alphaPixels = new Uint8Array(image.height * image.width)
  for (let row = 0; row < image.height; row++) {
    for (let column = 0; column < image.width; column++) {
      const source = row * image.width * components + column * components
      const colorTarget = row * colorStride + column * colorComponents
      for (let channel = 0; channel < colorComponents; channel++) {
        colorPixels[colorTarget + channel] = pixels[source + channel]!
      }
      alphaPixels[row * image.width + column] = pixels[source + colorComponents]!
    }
  }
  const [colorData, alphaData] = await Promise.all([
    deflateBytes(pngRefilter(colorPixels, image.width, image.height, colorComponents)),
    deflateBytes(pngRefilter(alphaPixels, image.width, image.height, 1)),
  ])
  return {
    width: image.width,
    height: image.height,
    colorSpace: components === 4 ? '/DeviceRGB' : '/DeviceGray',
    data: colorData,
    colors: components === 4 ? 3 : 1,
    smask: { data: alphaData },
  }
}

/** 不带 alpha 的 PNG（灰度/RGB）直通：IDAT 原样作为 PDF 流。 */
function plainPngImage(image: PngImage): PdfImage {
  return {
    width: image.width,
    height: image.height,
    colorSpace: image.colorType === 0 ? '/DeviceGray' : '/DeviceRGB',
    data: image.data,
    colors: image.colorType === 0 ? 1 : 3,
  }
}

/** 逐对象拼装 PDF；字符串与二进制段分开累积，避免 TextEncoder 二次编码。 */
function assemblePdf(pages: readonly PdfPage[], now: Date): Blob {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const created = `D:${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let offset = 0
  const offsets: number[] = []
  const push = (part: Uint8Array): void => {
    chunks.push(part as Uint8Array<ArrayBuffer>)
    offset += part.length
  }
  const beginObject = (id: number): void => {
    offsets[id] = offset
    push(asciiBytes(`${id} 0 obj\n`))
  }

  push(asciiBytes('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'))

  const pageCount = pages.length
  // 对象编号：1 目录，2 页树，3 信息，4.. 页；每页 3-4 个对象
  // （图片、可选 SMask、内容流、页面对象），编号随页连续分配。
  const objectsPerPage = pages.map(page => page.image.smask ? 4 : 3)
  const pageObjectIds: number[][] = []
  let nextId = 4
  for (let index = 0; index < pageCount; index++) {
    const ids: number[] = []
    for (let slot = 0; slot < objectsPerPage[index]!; slot++) ids.push(nextId++)
    pageObjectIds.push(ids)
  }
  const imageId = (index: number): number => pageObjectIds[index]![0]!
  const smaskId = (index: number): number => pageObjectIds[index]![1]!
  const contentId = (index: number): number => pageObjectIds[index]!.at(-2)!
  const pageId = (index: number): number => pageObjectIds[index]!.at(-1)!
  const maxId = nextId - 1
  const kids = pages.map((_, index) => `${pageId(index)} 0 R`).join(' ')

  beginObject(1)
  push(asciiBytes(`<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`))
  beginObject(2)
  push(asciiBytes(`<< /Type /Pages /Count ${pageCount} /Kids [ ${kids} ] >>\nendobj\n`))
  beginObject(3)
  push(asciiBytes(`<< /Producer (dsh-share) /CreationDate (${created}) >>\nendobj\n`))

  for (let index = 0; index < pageCount; index++) {
    const image = pages[index]!.image
    const smask = image.smask
    const decodeParms = `<< /Predictor 15 /Colors ${image.colors} /BitsPerComponent 8 /Columns ${image.width} >>`

    beginObject(imageId(index))
    push(asciiBytes(
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height}`
      + ` /ColorSpace ${image.colorSpace} /BitsPerComponent 8`
      + `${smask ? ` /SMask ${smaskId(index)} 0 R` : ''}`
      + ` /Filter /FlateDecode /DecodeParms ${decodeParms}`
      + ` /Length ${image.data.length} >>\nstream\n`,
    ))
    push(image.data)
    push(asciiBytes('\nendstream\nendobj\n'))

    if (smask) {
      beginObject(smaskId(index))
      push(asciiBytes(
        `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height}`
        + ` /ColorSpace /DeviceGray /BitsPerComponent 8`
        + ` /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns ${image.width} >>`
        + ` /Length ${smask.data.length} >>\nstream\n`,
      ))
      push(smask.data)
      push(asciiBytes('\nendstream\nendobj\n'))
    }

    const content = `${image.width} 0 0 ${image.height} 0 0 cm /Im0 Do\n`
    beginObject(contentId(index))
    push(asciiBytes(
      `<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`,
    ))

    beginObject(pageId(index))
    push(asciiBytes(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${image.width} ${image.height}]`
      + ` /Resources << /XObject << /Im0 ${imageId(index)} 0 R >> >>`
      + ` /Contents ${contentId(index)} 0 R >>\nendobj\n`,
    ))
  }

  const xrefOffset = offset
  const xref = [`xref\n0 ${maxId + 1}\n0000000000 65535 f \n`]
  for (let id = 1; id <= maxId; id++) xref.push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  xref.push(
    `trailer\n<< /Size ${maxId + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  )
  push(asciiBytes(xref.join('')))
  return new Blob(chunks, { type: 'application/pdf' })
}

/** 读取 Blob 字节；Blob.arrayBuffer 缺失时（旧 jsdom）用 FileReader 兜底。 */
async function readBlobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error('Could not read page bytes'))
    reader.readAsArrayBuffer(blob)
  })
}

/** 把分页 PNG 装配为单文件 PDF；单页同样生成，保证格式选择行为一致。 */
export async function createPagesPdf(pages: readonly Blob[], title?: string, now = new Date(), signal?: AbortSignal): Promise<Blob> {
  if (!pages.length || pages.length > 10000 || pages.reduce((sum, page) => sum + page.size, 0) > 512 * 1024 * 1024) {
    throw new Error('Archive exceeds export budget')
  }
  const pdfPages: PdfPage[] = []
  for (const page of pages) {
    signal?.throwIfAborted()
    const image = parsePng(await readBlobBytes(page))
    // 预览页始终是插件自己生成的 PNG；异常输入直接失败而不是产出坏页。
    if (!image) throw new Error('Share page is not a valid PNG')
    const components = pngComponents(image.colorType)
    const pdfImage = components === 2 || components === 4
      ? await splitAlphaPng(image, components)
      : plainPngImage(image)
    pdfPages.push({ image: pdfImage })
  }
  return assemblePdf(pdfPages, now)
}

/** 下载装配好的 PDF，命名与 PNG/HTML 导出一致。 */
export function downloadPdfFile(document: Document, blob: Blob, title?: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = createDownloadFilename('pdf', title)
  anchor.click()
  document.defaultView?.setTimeout(() => URL.revokeObjectURL(url), 60000)
}
