import type { ScrapeResult, HistoryEntry, AnalyticsData } from './types'

// 缓存管理
export class CacheManager {
  private static readonly CACHE_KEY_PREFIX = 'scraper_cache_'
  private static readonly CACHE_EXPIRY = 24 * 60 * 60 * 1000 // 24 hours

  static set(url: string, result: ScrapeResult): void {
    const key = this.CACHE_KEY_PREFIX + this.hashUrl(url)
    const data = {
      result,
      timestamp: Date.now(),
    }
    try {
      localStorage.setItem(key, JSON.stringify(data))
    } catch (e) {
      console.warn('Cache storage failed:', e)
    }
  }

  static get(url: string): ScrapeResult | null {
    const key = this.CACHE_KEY_PREFIX + this.hashUrl(url)
    try {
      const data = localStorage.getItem(key)
      if (!data) return null

      const parsed = JSON.parse(data)
      const age = Date.now() - parsed.timestamp

      if (age > this.CACHE_EXPIRY) {
        localStorage.removeItem(key)
        return null
      }

      return parsed.result
    } catch (e) {
      console.warn('Cache read failed:', e)
      return null
    }
  }

  static clear(): void {
    const keys = Object.keys(localStorage)
    keys.forEach(key => {
      if (key.startsWith(this.CACHE_KEY_PREFIX)) {
        localStorage.removeItem(key)
      }
    })
  }

  private static hashUrl(url: string): string {
    let hash = 0
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(36)
  }
}

// 历史记录管理
export class HistoryManager {
  private static readonly HISTORY_KEY = 'scraper_history'
  private static readonly MAX_HISTORY = 20

  static add(
    url: string,
    selector: string,
    extractMethod: string,
    itemCount: number
  ): void {
    const entries = this.getAll()
    const newEntry: HistoryEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2),
      url,
      selector,
      extractMethod,
      itemCount,
      timestamp: Date.now(),
    }

    entries.unshift(newEntry)
    const truncated = entries.slice(0, this.MAX_HISTORY)

    try {
      localStorage.setItem(this.HISTORY_KEY, JSON.stringify(truncated))
    } catch (e) {
      console.warn('History storage failed:', e)
    }
  }

  static getAll(): HistoryEntry[] {
    try {
      const data = localStorage.getItem(this.HISTORY_KEY)
      return data ? JSON.parse(data) : []
    } catch (e) {
      console.warn('History read failed:', e)
      return []
    }
  }

  static delete(id: string): void {
    const entries = this.getAll().filter(e => e.id !== id)
    try {
      localStorage.setItem(this.HISTORY_KEY, JSON.stringify(entries))
    } catch (e) {
      console.warn('History update failed:', e)
    }
  }

  static clear(): void {
    try {
      localStorage.removeItem(this.HISTORY_KEY)
    } catch (e) {
      console.warn('History clear failed:', e)
    }
  }
}

// 分析数据管理
export class AnalyticsManager {
  private static readonly ANALYTICS_KEY = 'scraper_analytics'

  static recordScrape(itemCount: number): void {
    const data = this.getData()
    data.totalScrapes++
    data.totalItems += itemCount
    data.averageItems = Math.round(data.totalItems / data.totalScrapes)
    data.lastUpdated = Date.now()

    try {
      localStorage.setItem(this.ANALYTICS_KEY, JSON.stringify(data))
    } catch (e) {
      console.warn('Analytics storage failed:', e)
    }
  }

  static recordCacheHit(): void {
    const data = this.getData()
    data.cacheHits++
    data.lastUpdated = Date.now()

    try {
      localStorage.setItem(this.ANALYTICS_KEY, JSON.stringify(data))
    } catch (e) {
      console.warn('Analytics storage failed:', e)
    }
  }

  static getData(): AnalyticsData {
    try {
      const data = localStorage.getItem(this.ANALYTICS_KEY)
      return data
        ? JSON.parse(data)
        : {
            totalScrapes: 0,
            totalItems: 0,
            cacheHits: 0,
            averageItems: 0,
            lastUpdated: Date.now(),
          }
    } catch (e) {
      console.warn('Analytics read failed:', e)
      return {
        totalScrapes: 0,
        totalItems: 0,
        cacheHits: 0,
        averageItems: 0,
        lastUpdated: Date.now(),
      }
    }
  }

  static clear(): void {
    try {
      localStorage.removeItem(this.ANALYTICS_KEY)
    } catch (e) {
      console.warn('Analytics clear failed:', e)
    }
  }
}
