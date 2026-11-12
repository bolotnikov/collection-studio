import type { StudioApi } from '../../shared/Contracts';
import 'vite/client';
declare global {
  interface Window {
    studio: StudioApi;
  }
}
