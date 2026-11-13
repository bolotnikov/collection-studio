import { z } from 'zod';
import path from 'node:path';
import type { CatalogAnalysisPort, CatalogInput } from '../application/knowledge/CatalogAnalysisPort';
import { CatalogSyncService } from '../application/knowledge/CatalogSyncService';
import type { CatalogState } from '../shared/CatalogState';
import type { VisualCatalog } from '../shared/VisualCatalogContracts';
import { VisualCatalogRules } from '../domain/VisualCatalogRules';
import { VisualCatalogStore } from './VisualCatalogStore';

/** Automatically refresh changed source assets; unchanged publications require no model calls. */
export class CatalogWorkspace {
  private state: CatalogState = { status: 'missing', stage: '', done: 0, total: 0, message: '' };
  private cancelled = false;
  private pending: Promise<void> | null = null;
  constructor(
    private readonly resources: string,
    private readonly storage: string,
    private readonly input: () => Promise<CatalogInput>,
    private readonly analysis: (input: CatalogInput, previous?: VisualCatalog) => CatalogAnalysisPort,
  ) {}
  async ready(): Promise<VisualCatalog> {
    const input = await this.input();
    for (const filename of [
      path.join(this.storage, 'visual-catalog.json'),
      path.join(this.resources, 'knowledge/visual-catalog.json'),
    ]) {
      try {
        const catalog = await new VisualCatalogStore(filename).read();
        if (catalog.dependencyHash !== input.dependencyHash) continue;
        VisualCatalogRules.validate(
          catalog,
          input.library.map((card) => card.id),
        );
        return catalog;
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
    }
    throw new Error('Knowledge catalog is being updated automatically.');
  }
  /** Keep the editor accessible when rules change; production still requires ready(). */
  async published(): Promise<VisualCatalog> {
    try {
      return await this.ready();
    } catch (error) {
      if (!(error instanceof Error && error.message === 'Knowledge catalog is being updated automatically.'))
        throw error;
      for (const file of [
        path.join(this.storage, 'visual-catalog.json'),
        path.join(this.resources, 'knowledge/visual-catalog.json'),
      ]) {
        try {
          return await new VisualCatalogStore(file).read();
        } catch (readError) {
          if (!(readError instanceof Error && 'code' in readError && readError.code === 'ENOENT'))
            throw readError;
        }
      }
      throw error;
    }
  }
  async status(): Promise<CatalogState> {
    if (['running', 'failed', 'cancelled'].includes(this.state.status)) return { ...this.state };
    try {
      const catalog = await this.ready();
      return {
        status: 'ready',
        stage: '',
        done: catalog.cards.length,
        total: catalog.cards.length,
        message: '',
      };
    } catch (error) {
      return {
        status: 'missing',
        stage: '',
        done: 0,
        total: 0,
        message: error instanceof Error ? error.message : 'Knowledge catalog unavailable.',
      };
    }
  }
  ensure(): Promise<void> {
    if (this.pending) return this.pending;
    this.pending = (async () => {
      try {
        const catalog = await this.ready();
        this.state = {
          status: 'ready',
          stage: '',
          done: catalog.cards.length,
          total: catalog.cards.length,
          message: '',
        };
        return;
      } catch (error) {
        if (!(
          error instanceof Error && error.message === 'Knowledge catalog is being updated automatically.'
        ))
          throw error;
      }
      this.cancelled = false;
      this.state = { status: 'running', stage: 'categories', done: 0, total: 0, message: '' };
      await this.execute();
      if (this.state.status !== 'ready') throw new Error(this.state.message);
    })()
      .catch((error: unknown) => {
        this.state = {
          ...this.state,
          status: 'failed',
          message: error instanceof Error ? error.message : String(error),
        };
        throw error;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }
  private async execute(): Promise<void> {
    try {
      const input = await this.input();
      let previous: VisualCatalog | undefined;
      for (const file of [
        path.join(this.storage, 'visual-catalog.json'),
        path.join(this.resources, 'knowledge/visual-catalog.json'),
      ]) {
        try {
          previous = await new VisualCatalogStore(file).read();
          break;
        } catch (error) {
          if (!(
            error instanceof SyntaxError ||
            error instanceof z.ZodError ||
            (error instanceof Error && 'code' in error && error.code === 'ENOENT')
          ))
            throw error;
        }
      }
      if (previous?.dependencyHash === input.dependencyHash) {
        VisualCatalogRules.validate(
          previous,
          input.library.map((card) => card.id),
        );
        this.state = {
          status: 'ready',
          stage: '',
          done: input.library.length,
          total: input.library.length,
          message: '',
        };
        return;
      }
      await new CatalogSyncService(
        this.analysis(input, previous),
        new VisualCatalogStore(path.join(this.storage, 'visual-catalog.json')),
      ).sync(
        input,
        () => this.cancelled,
        (stage, done, total) => {
          this.state = { status: 'running', stage, done, total, message: '' };
        },
      );
      this.state = {
        status: 'ready',
        stage: '',
        done: input.library.length,
        total: input.library.length,
        message: '',
      };
    } catch (error) {
      this.state = {
        ...this.state,
        status: this.cancelled ? 'cancelled' : 'failed',
        message: error instanceof Error ? error.message : 'Knowledge synchronization failed.',
      };
    }
  }
}
