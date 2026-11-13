export type CatalogState = {
  status: 'missing' | 'ready' | 'running' | 'failed' | 'cancelled';
  stage: string;
  done: number;
  total: number;
  message: string;
};
