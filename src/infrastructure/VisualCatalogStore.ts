import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CatalogPublicationPort } from '../application/knowledge/CatalogAnalysisPort';
import { VisualCatalogContracts, type VisualCatalog } from '../shared/VisualCatalogContracts';

export class VisualCatalogStore implements CatalogPublicationPort {
  constructor(private readonly filename: string) {}
  async read(): Promise<VisualCatalog> {
    return VisualCatalogContracts.catalog.parse(JSON.parse(await fs.readFile(this.filename, 'utf8')));
  }
  async publish(input: VisualCatalog): Promise<void> {
    const catalog = VisualCatalogContracts.catalog.parse(input);
    await fs.mkdir(path.dirname(this.filename), { recursive: true });
    const temporary = `${this.filename}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(catalog, null, 2));
    await fs.rename(temporary, this.filename);
  }
}
