import type { ScrapeRequest } from './types'

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: getCORSHeaders(),
      })
    }

    // 路由处理
    if (url.pathname === '/api/scrape' && request.method === 'POST') {
      return handleScrape(request)
    }

    // 处理静态文件或返回主页
    return handleStatic(request)
  },
}

async function handleScrape(request: Request): Promise<Response> {
  try {
    const body = await request.json() as ScrapeRequest

    // 验证输入
    if (!body.url || !body.selectors || body.selectors.length === 0) {
      return errorResponse('缺少必要参数', 400)
    }

    // 验证 URL
    try {
      new URL(body.url)
    } catch {
      return errorResponse('无效的 URL', 400)
    }

    const timeout = Math.min(body.timeout || 30, 120)

    // 使用 AbortController 处理超时
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout * 1000)

    try {
      // 发送请求
      const response = await fetch(body.url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
        },
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        return errorResponse(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status
        )
      }

      const html = await response.text()
      const items = parseHtml(html, body.selectors, body.extractMethod, body.attrName)

      return new Response(
        JSON.stringify({
          items: items.slice(0, 1000),
          html: html.substring(0, 50000),
          statusCode: response.status,
          url: body.url,
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            ...getCORSHeaders(),
          },
        }
      )
    } catch (error) {
      clearTimeout(timeoutId)

      const errorMessage = error instanceof Error ? error.message : '未知错误'

      if (errorMessage.includes('abort')) {
        return errorResponse(`请求超时（>${timeout}秒）`, 504)
      }

      return errorResponse(errorMessage, 500)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '请求解析失败'
    return errorResponse(errorMessage, 400)
  }
}

function parseHtml(html: string, selectors: string[], method: string, attrName?: string): string[] {
  const items: string[] = []

  for (const selector of selectors) {
    const trimmedSelector = selector.trim()
    if (!trimmedSelector) continue

    const elements = querySelectorAll(html, trimmedSelector)

    for (const element of elements) {
      let value = ''

      if (method === 'text') {
        value = getTextContent(element)
      } else if (method === 'html') {
        value = getInnerHtml(element)
      } else if (method === 'attr' && attrName) {
        value = getAttribute(element, attrName) || ''
      }

      if (value && !items.includes(value)) {
        items.push(value.trim())
      }
    }
  }

  return items
}

function querySelectorAll(html: string, selector: string): Array<{ html: string; content: string }> {
  const results: Array<{ html: string; content: string }> = []

  if (selector.startsWith('.')) {
    const className = selector.substring(1)
    const classRegex = new RegExp(`class=['\"](([^'\"]*\\b${className}\\b[^'\"]*))['\"]`, 'gi')
    let match

    while ((match = classRegex.exec(html)) !== null) {
      const startIndex = findElementStart(html, match.index)
      const closeTagIndex = findElementEnd(html, match.index, getTagName(html, startIndex))

      if (closeTagIndex !== -1) {
        const elementHtml = html.substring(startIndex, closeTagIndex)
        const tagEndIndex = elementHtml.indexOf('>')
        if (tagEndIndex !== -1) {
          results.push({
            html: elementHtml,
            content: elementHtml.substring(tagEndIndex + 1),
          })
        }
      }
    }
  } else if (selector.startsWith('#')) {
    const id = selector.substring(1)
    const idRegex = new RegExp(`id=['\"](${id})['\"]`, 'i')
    const match = idRegex.exec(html)

    if (match) {
      const startIndex = findElementStart(html, match.index)
      const closeTagIndex = findElementEnd(html, startIndex, getTagName(html, startIndex))

      if (closeTagIndex !== -1) {
        const elementHtml = html.substring(startIndex, closeTagIndex)
        const tagEndIndex = elementHtml.indexOf('>')
        if (tagEndIndex !== -1) {
          results.push({
            html: elementHtml,
            content: elementHtml.substring(tagEndIndex + 1),
          })
        }
      }
    }
  } else {
    const tagRegex = new RegExp(`<${selector}([\\s>])`, 'gi')
    let match

    while ((match = tagRegex.exec(html)) !== null) {
      const startIndex = match.index
      const closeTagIndex = findElementEnd(html, startIndex, selector)

      if (closeTagIndex !== -1) {
        const elementHtml = html.substring(startIndex, closeTagIndex)
        const tagEndIndex = elementHtml.indexOf('>')
        if (tagEndIndex !== -1) {
          results.push({
            html: elementHtml,
            content: elementHtml.substring(tagEndIndex + 1),
          })
        }
      }
    }
  }

  return results
}

function findElementStart(html: string, index: number): number {
  for (let i = index; i >= 0; i--) {
    if (html[i] === '<') {
      return i
    }
  }
  return 0
}

function findElementEnd(html: string, startIndex: number, tagName: string): number {
  const openTagEnd = html.indexOf('>', startIndex) + 1
  const closeTagPattern = new RegExp(`</\\${tagName}\\s*>`, 'i')
  const match = closeTagPattern.exec(html.substring(openTagEnd))

  if (!match) return -1

  return openTagEnd + match.index + match[0].length
}

function getTagName(html: string, index: number): string {
  const match = /^<(\w+)/.exec(html.substring(index))
  return match ? match[1] : 'div'
}

function getTextContent(element: { content: string }): string {
  return element.content.replace(/<[^>]*>/g, '').trim()
}

function getInnerHtml(element: { content: string }): string {
  return element.content
}

function getAttribute(element: { html: string }, attrName: string): string | null {
  const attrRegex = new RegExp(`${attrName}=['\"](\\S*?)['\"]`, 'i')
  const match = attrRegex.exec(element.html)
  return match ? match[1] : null
}

function handleStatic(request: Request): Response {
  const url = new URL(request.url)

  if (url.pathname === '/' || url.pathname === '/index.html') {
    return new Response(getIndexHtml(), {
      headers: {
        'Content-Type': 'text/html;charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        ...getCORSHeaders(),
      },
    })
  }

  return new Response('Not Found', { status: 404 })
}

function getIndexHtml(): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Cloudflare Web 爬虫</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body>
        <div id="app">加载中...</div>
        <script src="/src/main.ts" type="module"></script>
      </body>
    </html>
  `
}

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCORSHeaders(),
    },
  })
}

function getCORSHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}
