import { CacheManager, HistoryManager, AnalyticsManager } from './storage'
import { Analytics } from './analytics'
import type { ScrapeResult } from './types'

let lastResult: ScrapeResult | null = null

declare global {
  function startScrape(): void
  function switchTab(tabName: string): void
  function copyToClipboard(elementId: string): void
  function exportData(format: string): void
  function clearForm(): void
  function clearHistory(): void
}

window.startScrape = async function () {
  const targetUrl = (document.getElementById('targetUrl') as HTMLInputElement).value
  const selector = (document.getElementById('selector') as HTMLTextAreaElement).value
  const extractMethod = (document.getElementById('extractMethod') as HTMLSelectElement).value
  const attrName = (document.getElementById('attrName') as HTMLInputElement).value
  const timeout = (document.getElementById('timeout') as HTMLInputElement).value

  // 验证输入
  if (!targetUrl.trim()) {
    showError('请输入目标 URL')
    return
  }

  if (!selector.trim()) {
    showError('请输入 CSS 选择器')
    return
  }

  // 验证 URL 格式
  try {
    new URL(targetUrl)
  } catch {
    showError('URL 格式不正确')
    return
  }

  const btn = document.getElementById('scrapeBtn') as HTMLButtonElement
  const loading = document.getElementById('loading')
  btn.disabled = true
  loading?.classList.add('active')

  try {
    const startTime = performance.now()

    // 检查缓存
    const cached = CacheManager.get(targetUrl)
    let isCached = false

    if (cached) {
      lastResult = cached
      isCached = true
      AnalyticsManager.recordCacheHit()
    } else {
      // 执行爬虫
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: targetUrl,
          selectors: selector.split('\n').filter(s => s.trim()),
          extractMethod,
          attrName,
          timeout: parseInt(timeout),
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        showError(`爬虫失败: ${response.status} - ${error}`)
        return
      }

      const data = await response.json()
      lastResult = {
        ...data,
        costTime: Math.round(performance.now() - startTime),
        timestamp: Date.now(),
      }

      // 缓存结果
      CacheManager.set(targetUrl, lastResult)
    }

    displayResults(lastResult, isCached)
    showSuccess('爬虫完成！')

    // 添加到历史
    HistoryManager.add(targetUrl, selector.split('\n')[0], extractMethod, lastResult.items.length)
    displayHistory()
    Analytics.displayStats()
  } catch (error) {
    showError(`错误: ${error instanceof Error ? error.message : '未知错误'}`)
  } finally {
    btn.disabled = false
    loading?.classList.remove('active')
  }
}

window.switchTab = function (tabName: string) {
  // 隐藏所有 tab 内容
  document.querySelectorAll('.result-content').forEach(el => {
    el.classList.remove('active')
  })

  // 移除所有按钮的 active 类
  document.querySelectorAll('.tab-btn').forEach(el => {
    el.classList.remove('active')
  })

  // 显示选中的 tab
  const content = document.getElementById(tabName)
  if (content) {
    content.classList.add('active')
  }

  // 标记按钮为 active
  const buttons = document.querySelectorAll('.tab-btn')
  buttons.forEach(btn => {
    if (btn.textContent?.toLowerCase().includes(tabName.charAt(0))) {
      btn.classList.add('active')
    }
  })
}

window.copyToClipboard = function (elementId: string) {
  const element = document.getElementById(elementId) as HTMLElement
  if (!element) return

  const text = element.textContent || ''
  navigator.clipboard.writeText(text).then(() => {
    showSuccess('已复制到剪贴板！')
  }).catch(() => {
    showError('复制失败')
  })
}

window.exportData = function (format: string) {
  if (!lastResult) {
    showError('没有可导出的数据')
    return
  }

  let content = ''
  let filename = `scrape_result_${Date.now()}`
  let mimeType = 'text/plain'

  if (format === 'csv') {
    content = lastResult.items
      .map((item, idx) => `${idx + 1},"${item.replace(/"/g, '""')}"`)
      .join('\n')
    content = '序号,内容\n' + content
    filename += '.csv'
    mimeType = 'text/csv;charset=utf-8;'
  } else if (format === 'json') {
    content = JSON.stringify(lastResult.items, null, 2)
    filename += '.json'
    mimeType = 'application/json;charset=utf-8;'
  } else if (format === 'html') {
    const html = lastResult.items
      .map(
        (item, idx) =>
          `<tr><td>${idx + 1}</td><td>${escapeHtml(item)}</td></tr>`
      )
      .join('')
    content = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>爬虫结果</title>
          <style>
            body { font-family: Arial; margin: 20px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            th { background-color: #f5f5f5; }
          </style>
        </head>
        <body>
          <h1>爬虫结果</h1>
          <p>URL: ${lastResult.url}</p>
          <table>
            <thead><tr><th>#</th><th>内容</th></tr></thead>
            <tbody>${html}</tbody>
          </table>
        </body>
      </html>
    `
    filename += '.html'
    mimeType = 'text/html;charset=utf-8;'
  }

  const blob = new Blob([content], { type: mimeType })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)

  showSuccess(`已导出 ${format.toUpperCase()} 文件`)
}

window.clearForm = function () {
  (document.getElementById('targetUrl') as HTMLInputElement).value =
    'https://news.ycombinator.com'
  (document.getElementById('selector') as HTMLTextAreaElement).value = '.story-title a'
  (document.getElementById('extractMethod') as HTMLSelectElement).value = 'text'
  (document.getElementById('attrName') as HTMLInputElement).value = 'href'
  (document.getElementById('timeout') as HTMLInputElement).value = '30'

  hideMessages()
}

window.clearHistory = function () {
  if (confirm('确定要清空所有历史记录吗？')) {
    HistoryManager.clear()
    displayHistory()
    Analytics.displayStats()
    showSuccess('历史记录已清空')
  }
}

function displayResults(result: ScrapeResult, isCached: boolean = false) {
  // 更新统计
  (document.getElementById('itemCount') as HTMLElement).textContent = result.items.length.toString()
  (document.getElementById('costTime') as HTMLElement).textContent = `${Math.round(result.costTime)}ms`
  (document.getElementById('statusCode') as HTMLElement).textContent = result.statusCode.toString()
  (document.getElementById('cacheStatus') as HTMLElement).textContent = isCached ? '✓ 缓存' : '-'

  // JSON 视图
  const jsonResult = document.getElementById('jsonResult') as HTMLElement
  jsonResult.textContent = JSON.stringify(result.items, null, 2)

  // 表格视图
  const tableResult = document.getElementById('tableResult') as HTMLElement
  if (result.items.length > 0) {
    const tableHtml = `
      <table>
        <thead>
          <tr>
            <th style="width: 60px;">#</th>
            <th>内容</th>
          </tr>
        </thead>
        <tbody>
          ${result.items
            .map(
              (item, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td>${escapeHtml(item)}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `
    tableResult.innerHTML = tableHtml
  } else {
    tableResult.textContent = '没有找到匹配的数据'
  }

  // 原始 HTML 视图
  const rawResult = document.getElementById('rawResult') as HTMLElement
  rawResult.textContent = result.html.substring(0, 5000)
}

function displayHistory() {
  const historyList = document.getElementById('historyList') as HTMLElement
  const history = HistoryManager.getAll()

  if (history.length === 0) {
    historyList.innerHTML = '<div class="history-empty">暂无历史记录</div>'
    return
  }

  historyList.innerHTML = history
    .map(
      entry => `
      <div class="history-item" onclick="window.restoreHistory('${entry.id}')">
        <div class="history-item-info">
          <div class="history-item-url">📝 ${entry.url}</div>
          <div class="history-item-time">${new Date(entry.timestamp).toLocaleString()} | 获取 ${entry.itemCount} 条数据</div>
        </div>
        <button class="btn-small" onclick="event.stopPropagation(); window.deleteHistory('${entry.id}')" style="margin-left: 10px;">删除</button>
      </div>
    `
    )
    .join('')
}

declare global {
  function restoreHistory(id: string): void
  function deleteHistory(id: string): void
}

window.restoreHistory = function (id: string) {
  const history = HistoryManager.getAll()
  const entry = history.find(h => h.id === id)
  if (!entry) return

  (document.getElementById('targetUrl') as HTMLInputElement).value = entry.url
  (document.getElementById('selector') as HTMLTextAreaElement).value = entry.selector
  showSuccess('已恢复历史记录')
}

window.deleteHistory = function (id: string) {
  HistoryManager.delete(id)
  displayHistory()
  showSuccess('已删除历史记录')
}

function showError(message: string) {
  const errorMsg = document.getElementById('errorMsg') as HTMLElement
  errorMsg.textContent = message
  errorMsg.classList.add('show')

  setTimeout(() => {
    errorMsg.classList.remove('show')
  }, 5000)
}

function showSuccess(message: string) {
  const successMsg = document.getElementById('successMsg') as HTMLElement
  successMsg.textContent = message
  successMsg.classList.add('show')

  setTimeout(() => {
    successMsg.classList.remove('show')
  }, 3000)
}

function hideMessages() {
  document.getElementById('errorMsg')?.classList.remove('show')
  document.getElementById('successMsg')?.classList.remove('show')
}

function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, m => map[m])
}

// 初始化
window.addEventListener('DOMContentLoaded', () => {
  displayHistory()
  Analytics.displayStats()
  console.log('🕷️ Web Scraper 已加载')
})
