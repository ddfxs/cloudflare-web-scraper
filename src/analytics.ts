import { AnalyticsManager } from './storage'

export class Analytics {
  static displayStats(): void {
    const data = AnalyticsManager.getData()
    const statsContainer = document.getElementById('analyticsStats')

    if (!statsContainer) return

    const cacheHitRate =
      data.totalScrapes > 0
        ? ((data.cacheHits / data.totalScrapes) * 100).toFixed(1)
        : 0

    statsContainer.innerHTML = `
      <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #e0e0e0;">
        <h3 style="font-size: 0.95rem; color: #666; margin-bottom: 10px;">📈 统计数据</h3>
        <div class="analytics-grid">
          <div class="stat-mini">
            <div class="stat-value">${data.totalScrapes}</div>
            <div class="stat-label">爬虫次数</div>
          </div>
          <div class="stat-mini">
            <div class="stat-value">${data.totalItems}</div>
            <div class="stat-label">总数据量</div>
          </div>
          <div class="stat-mini">
            <div class="stat-value">${data.averageItems}</div>
            <div class="stat-label">平均数据</div>
          </div>
          <div class="stat-mini">
            <div class="stat-value">${cacheHitRate}%</div>
            <div class="stat-label">缓存命中</div>
          </div>
        </div>
      </div>
    `
  }
}
