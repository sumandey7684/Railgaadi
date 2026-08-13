export type DataSource = 'live' | 'cached' | 'fallback' | 'unavailable';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
  cached?: boolean;
  dataSource?: DataSource;
}
