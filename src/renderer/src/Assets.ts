import type { Card, Run } from '../../shared/Contracts';

export class Assets {
  static reference(filename: string): string {
    return `studio-asset://references/${encodeURIComponent(filename)}`;
  }
  static image(run: Run, relative: string): string {
    return `studio-asset://runs/${run.id}/${relative.split('/').map(encodeURIComponent).join('/')}`;
  }
  static selected(card: Card) {
    return card.attempts.find((a) => a.id === card.selectedAttemptId);
  }
  static active(run: Run): boolean {
    return ['planning', 'generating', 'reviewing'].includes(run.status);
  }
  static status(run: Run): string {
    return {
      planning: 'Planning',
      generating: 'Generating',
      reviewing: 'Reviewing',
      completed: 'Complete',
      paused: 'Paused',
      failed: 'Error',
    }[run.status];
  }
}
