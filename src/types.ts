export interface ScrapeRequest {
  url: string
  selectors: string[]
  extractMethod: 'text' | 'html' | 'attr'
  attrName?: string
  timeout?: number
}

export interface ScrapeResult {
  items: string[]
  html: string
  statusCode: number
  url: string
  costTime: number
  timestamp: number
}

export interface HistoryEntry {
  id: string
  url: string
  selector: string
  extractMethod: string
  itemCount: number
  timestamp: number
}

export interface AnalyticsData {
  totalScrapes: number
  totalItems: number
  cacheHits: number
  averageItems: number
  lastUpdated: number
}
