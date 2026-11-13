import { DeliveryContracts } from '../shared/DeliveryContracts';
import { VisualCatalogStore } from '../infrastructure/VisualCatalogStore';
import { KnowledgeWorkspace } from '../infrastructure/KnowledgeWorkspace';
import { KnowledgeEditorContracts } from '../shared/KnowledgeEditorContracts';
import { createHash } from 'node:crypto';
import { CatalogWorkspace } from '../infrastructure/CatalogWorkspace';
import { CatalogInputLoader } from '../infrastructure/CatalogInputLoader';
import { CodexCatalogAnalysis } from '../infrastructure/CodexCatalogAnalysis';
import catalogPrompts from '../../resources/prompts/catalog.json';
import { StyleRuleContracts } from '../shared/StyleRuleContracts';
import { ReferenceProfile } from '../domain/ReferenceProfile';
import { StyleRulesStore } from '../infrastructure/StyleRulesStore';
import { StyleRulesService } from '../application/StyleRulesService';
import artDirectionDefaults from '../../resources/prompts/art-direction.json';
import { ArtDirectionService } from '../application/ArtDirectionService';
import type { Settings } from '../shared/Contracts';
import { RetrievalConfiguration } from '../shared/RetrievalConfiguration';
import { PromptCatalog } from '../application/prompts/PromptCatalog';
import { SetContract } from '../shared/SetContract';
import type { Profile } from '../shared/Contracts';
import { SourceKnowledgeStore } from '../infrastructure/SourceKnowledgeStore';
import { CodexSourceContext } from '../infrastructure/style/CodexSourceContext';
import { ReferenceLibrary } from '../infrastructure/ReferenceLibrary';
import { ReferenceLibraryService } from '../application/style/ReferenceLibraryService';
import { StyleContracts, type ProductionPolicy } from '../shared/StyleContracts';
import { CodexStylePreparation } from '../infrastructure/style/CodexStylePreparation';
import { NativeMenus } from './NativeMenus';
import { Localization } from '../shared/i18n/Localization';
import { app, BrowserWindow, dialog, ipcMain, protocol, nativeTheme, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { Contracts, type Run } from '../shared/Contracts';
import { RunRepository } from '../infrastructure/RunRepository';
import { ImageFiles } from '../infrastructure/ImageFiles';
import { RunService } from '../application/RunService';
import { DeliveryPreviewService } from '../infrastructure/DeliveryPreviewService';
import { ExportService } from '../infrastructure/ExportService';
import { SettingsStore } from './SettingsStore';
import { AssetProtocol } from './AssetProtocol';
import { CodexRunner } from '../infrastructure/CodexRunner';
import { CodexProvider } from '../infrastructure/CodexProvider';
import { ExecutionJournal } from '../infrastructure/ExecutionJournal';
import { ExecutionLogExporter } from '../infrastructure/ExecutionLogExporter';

class DesktopApplication {
  private translator = new Localization('en');
  private readonly menus = new NativeMenus();
  private window: BrowserWindow | null = null;
  async init(): Promise<void> {
    nativeTheme.themeSource = 'dark';
    if (!app.requestSingleInstanceLock()) {
      app.quit();
      return;
    }
    protocol.registerSchemesAsPrivileged([
      { scheme: 'studio-asset', privileges: { standard: true, secure: true, supportFetchAPI: true } },
    ]);
    await app.whenReady();
    const resources = app.isPackaged ? process.resourcesPath : path.resolve('resources');
    const runsRoot = process.env.COLLECTION_STUDIO_DATA || path.join(app.getPath('userData'), 'runs');
    const settings = new SettingsStore(app.getPath('userData'));
    await settings.init();
    let codexExecutable = '',
      codexReady = false;
    const refreshCodex = async () => {
      try {
        codexExecutable = await CodexRunner.locate(settings.settings.codexPath);
        await CodexRunner.check(codexExecutable);
        codexReady = true;
      } catch {
        codexReady = false;
      }
    };
    await refreshCodex();
    const knowledgeStore = new SourceKnowledgeStore(path.join(app.getPath('userData'), 'knowledge-assets'));
    const knowledge = await knowledgeStore.import(resources);
    const prompts = new PromptCatalog(
      JSON.parse(await fs.readFile(path.join(resources, 'prompts/production.json'), 'utf8')),
    );
    const planningPolicy = SetContract.planningPolicy.parse(
      JSON.parse(await fs.readFile(path.join(resources, 'production-config.json'), 'utf8')),
    );
    let profile = Contracts.profile.parse({
      ...JSON.parse(await fs.readFile(path.join(resources, 'style-profile.json'), 'utf8')),
      knowledge,
      promptCatalog: prompts.values,
      retrievalConfig: new RetrievalConfiguration(
        JSON.parse(await fs.readFile(path.join(resources, 'retrieval-config.json'), 'utf8')),
      ).values,
    });
    const styleStore = new StyleRulesStore(app.getPath('userData'));
    await styleStore.init({ version: 1, rendering: profile.rules, categories: profile.categories });
    profile = Contracts.profile.parse({
      ...profile,
      rules: styleStore.get().rendering,
      categories: styleStore.get().categories,
      requirements: JSON.parse(
        await fs.readFile(path.join(resources, 'production-requirements.json'), 'utf8'),
      ),
    });
    const referenceRoot = path.join(app.getPath('userData'), 'reference-library');
    const library = new ReferenceLibrary(referenceRoot, app.getPath('userData'));
    await library.init(resources);
    let referenceCount = 0;
    for (const ref of profile.references) {
      try {
        await fs.access(path.join(referenceRoot, ref.filename));
        referenceCount++;
      } catch {
        /* Missing art is reported in the bootstrap state. */
      }
    }
    const journal = new ExecutionJournal(runsRoot);
    const repository = new RunRepository(runsRoot, (directory) => shell.trashItem(directory), journal),
      images = new ImageFiles();
    await repository.recover();
    const delivery = new DeliveryPreviewService(images, knowledgeStore.root);
    const jobsRoot = (sourceProfile: Profile) =>
      sourceProfile.productionRunId
        ? path.join(repository.directory(sourceProfile.productionRunId), '_jobs')
        : path.join(runsRoot, '_codex-jobs');
    const runAudit = (sourceProfile: Profile) =>
      sourceProfile.productionRunId ? { journal, runId: sourceProfile.productionRunId } : undefined;
    const prepareStyle = (policy: ProductionPolicy, sourceProfile: Profile = profile) =>
      new CodexStylePreparation(
        new CodexRunner(
          codexExecutable,
          jobsRoot(sourceProfile),
          sourceProfile.analysisModel ?? settings.settings.codexModel,
          new PromptCatalog(sourceProfile.promptCatalog),
          runAudit(sourceProfile),
        ),
        structuredClone(sourceProfile.library ?? library.items),
        referenceRoot,
        path.join(app.getPath('userData'), 'reference-analysis'),
        sourceProfile.analysisModel ?? settings.settings.codexModel,
        policy,
        new PromptCatalog(sourceProfile.promptCatalog),
        sourceProfile.retrievalConfig,
        sourceProfile.categories,
      );
    const makeProvider = (s: Settings, sourceProfile: Profile) => {
      const templates = new PromptCatalog(sourceProfile.promptCatalog);
      if (!codexReady) throw new Error('Connect Codex CLI with ChatGPT in Settings.');
      return new CodexProvider(
        new CodexRunner(
          codexExecutable,
          jobsRoot(sourceProfile),
          s.codexModel,
          templates,
          runAudit(sourceProfile),
        ),
        templates,
        s.planningModel
          ? new CodexRunner(
              codexExecutable,
              jobsRoot(sourceProfile),
              s.planningModel,
              templates,
              runAudit(sourceProfile),
            )
          : undefined,
      );
    };
    const direction = new ArtDirectionService(
      makeProvider,
      new PromptCatalog(
        JSON.parse(await fs.readFile(path.join(resources, 'prompts/art-direction.json'), 'utf8')),
        artDirectionDefaults,
      ),
    );
    this.handle('suggestArtDirection', z.tuple([Contracts.artDirectionRequest]), ([request]) =>
      direction.suggest(request, settings.settings, {
        ...profile,
        rules: [...profile.rules, ...library.policy.rules],
      }),
    );
    const catalogTemplates = new PromptCatalog(catalogPrompts, catalogPrompts);
    const catalogRules = () => ({
      ...CatalogInputLoader.rules(),
      rendering: profile.rules,
      categories: { ...CatalogInputLoader.rules().categories, ...profile.categories },
    });
    const shippedCatalog = await new VisualCatalogStore(
      path.join(resources, 'knowledge/visual-catalog.json'),
    ).read();
    const catalogWorkspace = new CatalogWorkspace(
      resources,
      path.join(app.getPath('userData'), 'prepared-knowledge'),
      () =>
        new CatalogInputLoader(resources).load(
          shippedCatalog.model,
          catalogTemplates.values,
          CatalogInputLoader.rules(),
        ),
      (input, previous) =>
        new CodexCatalogAnalysis(
          new CodexRunner(codexExecutable, path.join(runsRoot, '_catalog-jobs'), input.model),
          resources,
          path.join(app.getPath('userData'), 'catalog-analysis'),
          catalogTemplates,
          input.rules,
          previous,
        ),
    );
    const knowledgeWorkspace = new KnowledgeWorkspace(
      path.join(app.getPath('userData'), 'working-knowledge.json'),
      knowledgeStore.root,
      library,
      () => catalogWorkspace.published(),
      () =>
        new CodexRunner(
          codexExecutable,
          path.join(runsRoot, '_knowledge-jobs'),
          settings.settings.codexModel,
        ),
      catalogRules,
    );
    await knowledgeWorkspace.init();
    // Resume interrupted additions and source migrations without reanalyzing existing observations.
    void catalogWorkspace
      .ensure()
      .then(() => knowledgeWorkspace.ensureCards())
      .catch(() => {
        /* Persistent update state is exposed by getCatalogStatus/getKnowledge. */
      });
    const withKnowledge = async (): Promise<Profile> => {
      await catalogWorkspace.ready();
      const snapshot = await knowledgeWorkspace.generation();
      const available = snapshot.library.filter(
        (item) => item.origin === 'anchor' && item.approved && item.category !== 'unknown',
      );
      const originalIds = [
        ...new Set([...profile.references.map((ref) => ref.id), ...available.map((item) => item.id)]),
      ];
      const references = originalIds
        .flatMap((id) => {
          const item = available.find((item) => item.id === id);
          return item && item.category !== 'unknown'
            ? [
                {
                  id: item.id,
                  filename: item.filename,
                  title: item.title,
                  category: item.category,
                  sha256: item.sha256,
                  source: item.source,
                },
              ]
            : [];
        })
        .slice(0, 8);
      const setIds = new Set(snapshot.catalog.sets.map((set) => set.id));
      return {
        ...profile,
        visualCatalog: snapshot.catalog,
        library: snapshot.library,
        references,
        knowledge: profile.knowledge
          ? {
              ...profile.knowledge,
              images: snapshot.catalog.images,
              cleanSets: [...(profile.knowledge.cleanSets ?? []), ...snapshot.cleanSets]
                .filter((set) => setIds.has(set.sourceImageId))
                .map((set) => {
                  const cards = set.cards.map((card) => ({
                    ...card,
                    use:
                      snapshot.library.find((item) => item.id === card.id)?.category === '5'
                        ? ('excluded-gold-character' as const)
                        : ('ordinary' as const),
                  }));
                  return { ...set, cards, primaryEligible: cards.every((card) => card.use === 'ordinary') };
                }),
            }
          : undefined,
      };
    };
    this.handle('getKnowledge', z.tuple([]), () => knowledgeWorkspace.snapshot());
    this.handle('saveKnowledge', z.tuple([KnowledgeEditorContracts.edit]), async ([edit]) =>
      knowledgeWorkspace.save(edit),
    );
    this.handle('removeKnowledge', z.tuple([KnowledgeEditorContracts.kind, z.string()]), async ([kind, id]) =>
      knowledgeWorkspace.remove(kind, id),
    );
    this.handle('importKnowledge', z.tuple([KnowledgeEditorContracts.import]), async ([input]) => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      });
      const file = result.filePaths[0];
      return result.canceled || !file ? null : knowledgeWorkspace.import(file, input);
    });
    const catalogStatus = async () => {
      const base = await catalogWorkspace.status();
      return base.status === 'ready' ? (await knowledgeWorkspace.snapshot()).job : base;
    };
    this.handle('getCatalogStatus', z.tuple([]), catalogStatus);
    const service = new RunService(
      repository,
      images,
      profile,
      referenceRoot,
      makeProvider,
      (r) => this.publish(r),
      (policy, sourceProfile) => {
        if (!codexReady && !sourceProfile.visualCatalog)
          throw new Error('Connect Codex with ChatGPT for reference analysis.');
        return prepareStyle(policy, sourceProfile);
      },
      (sourceProfile) =>
        new CodexSourceContext(
          new CodexRunner(
            codexExecutable,
            jobsRoot(sourceProfile),
            sourceProfile.analysisModel ?? settings.settings.codexModel,
            new PromptCatalog(sourceProfile.promptCatalog),
            runAudit(sourceProfile),
          ),
          knowledgeStore.root,
          path.join(app.getPath('userData'), 'source-analysis'),
          sourceProfile.analysisModel ?? settings.settings.codexModel,
          new PromptCatalog(sourceProfile.promptCatalog),
        ),
      planningPolicy,
    );
    const styleRules = new StyleRulesService(styleStore);
    const referenceService = new ReferenceLibraryService(library, () => {
      if (!codexReady) throw new Error('Connect Codex with ChatGPT for reference analysis.');
      return prepareStyle(library.policy, { ...profile, library: library.items });
    });
    this.handle('editReference', z.tuple([StyleContracts.referenceEdit]), ([input]) =>
      referenceService.edit(input),
    );
    this.handle('analyzeReference', z.tuple([z.string().min(1)]), ([id]) => referenceService.analyze(id));
    this.handle('importReference', z.tuple([]), async () => {
      const result = await dialog.showOpenDialog({
        title: this.translator.t('Add reference'),
        properties: ['openFile'],
        filters: [{ name: this.translator.t('Images'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      });
      const file = result.filePaths[0];
      if (result.canceled || !file) return null;
      const item = await referenceService.import(file);
      await knowledgeWorkspace.ensureCards();
      return (await knowledgeWorkspace.snapshot()).library.find((entry) => entry.id === item.id) ?? item;
    });
    this.handle('saveStyleRules', z.tuple([StyleRuleContracts.edit]), async ([input]) => {
      const saved = await styleRules.save(input);
      profile = {
        ...profile,
        rules: saved.rendering,
        categories: saved.categories,
      };
      service.updateProfile(profile);
      return saved;
    });
    new AssetProtocol(runsRoot, referenceRoot, knowledgeStore.root).register();
    const cardRef = z.tuple([Contracts.id, Contracts.id]);
    this.handle('setLanguage', z.tuple([z.enum(['en', 'ru'])]), async ([locale]) => {
      this.translator = new Localization(locale);
      this.menus.apply(locale);
    });
    this.handle('getSystemLanguages', z.tuple([]), async () => app.getPreferredSystemLanguages());
    this.handle('setAppearance', z.tuple([z.enum(['dark', 'light'])]), async ([theme]) => {
      nativeTheme.themeSource = theme;
    });
    this.handle('bootstrap', z.tuple([]), async () => {
      let sourceProfile = profile;
      let catalogError: string | null = null;
      try {
        sourceProfile = await withKnowledge();
      } catch (error) {
        catalogError = this.message(error);
      }
      const state = await catalogStatus();
      const catalog = await prepareStyle(library.policy, sourceProfile).catalog();
      return {
        catalogReady: Boolean(sourceProfile.visualCatalog),
        catalogState:
          catalogError && state.status === 'ready'
            ? { ...state, status: 'failed' as const, message: catalogError }
            : state,
        styleRules: styleStore.get(),
        runs: await repository.list(),
        profile,
        settings: settings.settings,
        codexReady,
        referenceCount,
        dataPath: runsRoot,
        productionPolicy: library.policy,
        library: catalog,
      };
    });
    this.handle('getRunProfile', z.tuple([Contracts.id]), ([id]) => repository.getProfile(id));
    this.handle('start', z.tuple([Contracts.brief]), async ([brief]) => {
      if (!codexReady) throw new Error('Connect Codex with ChatGPT for reference analysis.');
      if (referenceCount !== profile.references.length || referenceCount < 4)
        throw new Error('Prepare the style references before generating.');
      const sourceProfile = await withKnowledge();
      const effective = await prepareStyle(library.policy, sourceProfile).catalog();
      const revision = createHash('sha256')
        .update(
          JSON.stringify([
            sourceProfile.visualCatalog?.dependencyHash,
            effective.map((item) => [
              item.id,
              item.sha256,
              item.metadata?.category ?? item.category,
              item.metadata?.description ?? item.title,
            ]),
          ]),
        )
        .digest('hex');
      service.updateProfile(ReferenceProfile.resolve(sourceProfile, effective, revision));
      return service.start(
        {
          ...brief,
          autoRepair: true,
        },
        settings.settings,
        structuredClone(library.policy),
      );
    });
    this.handle('saveProductionPolicy', z.tuple([StyleContracts.policy]), async ([policy]) =>
      library.savePolicy(policy),
    );
    this.handle('approveReference', cardRef, async ([id, cardId]) => {
      const run = await repository.get(id);
      const card = run.variants.flatMap((v) => v.cards).find((c) => c.id === cardId);
      if (!card) throw new Error('Card not found.');
      await library.approve(run, card, repository.directory(id));
      await knowledgeWorkspace.ensureCards();
    });
    this.handle('removeReference', z.tuple([z.string().min(1)]), async ([id]) => library.remove(id));
    this.handle('pause', z.tuple([Contracts.id]), ([id]) => service.pause(id));
    this.handle('deleteRun', z.tuple([Contracts.id]), ([id]) => service.remove(id));
    this.handle('resume', z.tuple([Contracts.id]), ([id]) =>
      service.resume(id, structuredClone(library.policy), settings.settings),
    );
    this.handle(
      'retry',
      z.tuple([Contracts.id, Contracts.id, z.string().max(2000)]),
      ([id, card, instruction]) =>
        service.retry(id, card, instruction, structuredClone(library.policy), settings.settings),
    );
    this.handle('selectAttempt', z.tuple([Contracts.id, Contracts.id, Contracts.id]), ([id, card, attempt]) =>
      service.selectAttempt(id, card, attempt),
    );
    this.handle('lock', z.tuple([Contracts.id, Contracts.id, z.boolean()]), ([id, card, locked]) =>
      service.lock(id, card, locked),
    );
    this.handle('selectVariant', cardRef, ([id, variant]) => service.selectVariant(id, variant));
    this.handle('setBudget', z.tuple([Contracts.id, z.number().int().min(1).max(150)]), ([id, maximum]) =>
      service.setBudget(id, maximum),
    );
    this.handle('previewDelivery', cardRef, async ([id, variantId]) => {
      const run = await repository.get(id);
      if (['planning', 'generating', 'reviewing'].includes(run.status))
        throw new Error('Wait for generation to finish.');
      return delivery.create(run, variantId, repository.directory(id));
    });
    this.handle(
      'exportDeliveryPreview',
      z.tuple([Contracts.id, z.string(), DeliveryContracts.preview]),
      async ([id, variantId, preview]) => {
        const run = await repository.get(id);
        if (['planning', 'generating', 'reviewing'].includes(run.status))
          throw new Error('Wait for generation to finish.');
        const result = await dialog.showSaveDialog({
          title: this.translator.t('Export window as PNG'),
          defaultPath: `window-${preview.id}-${id.slice(0, 8)}.png`,
          filters: [{ name: 'PNG', extensions: ['png'] }],
        });
        if (result.canceled || !result.filePath) return null;
        await delivery.export(run, variantId, repository.directory(id), preview, result.filePath);
        return result.filePath;
      },
    );
    this.handle('exportDiagnostics', z.tuple([Contracts.id]), async ([id]) => {
      const run = await repository.get(id);
      const result = await dialog.showSaveDialog({
        title: this.translator.t('Download diagnostics'),
        defaultPath: `diagnostics-${id.slice(0, 8)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePath) return null;
      await fs.writeFile(
        result.filePath,
        await new ExecutionLogExporter(journal).diagnostics(run, await repository.getProfile(id)),
      );
      return result.filePath;
    });
    this.handle('exportExecutionLog', z.tuple([Contracts.id]), async ([id]) => {
      const run = await repository.get(id);
      const result = await dialog.showSaveDialog({
        title: this.translator.t('Download execution log'),
        defaultPath: `journal-${id.slice(0, 8)}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (result.canceled || !result.filePath) return null;
      const savedProfile = await repository.getProfile(id);
      await fs.writeFile(result.filePath, await new ExecutionLogExporter(journal).render(run, savedProfile));
      return result.filePath;
    });
    this.handle('export', cardRef, async ([id, variantId]) => {
      const run = await repository.get(id);
      const result = await dialog.showSaveDialog({
        title: this.translator.t('Export set'),
        defaultPath: `collection-${id.slice(0, 8)}.zip`,
        filters: [{ name: this.translator.t('ZIP archive'), extensions: ['zip'] }],
      });
      if (result.canceled || !result.filePath) return null;
      await new ExportService(images, delivery, new ExecutionLogExporter(journal)).export(
        run,
        variantId,
        repository.directory(id),
        result.filePath,
      );
      return result.filePath;
    });
    this.handle('saveSettings', z.tuple([Contracts.settings]), async ([value]) => {
      await settings.save(value);
      await refreshCodex();
      void catalogWorkspace
        .ensure()
        .then(() => knowledgeWorkspace.ensureCards())
        .catch(() => {});
    });
    this.handle('checkConnection', z.tuple([]), async () => {
      try {
        await refreshCodex();
        const message = await CodexRunner.check(codexExecutable);
        void catalogWorkspace
          .ensure()
          .then(() => knowledgeWorkspace.ensureCards())
          .catch(() => {});
        return { ok: true, message };
      } catch (error) {
        return { ok: false, message: this.message(error) };
      }
    });
    this.createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) this.createWindow();
    });
    app.on('window-all-closed', () => app.quit());
    app.on('second-instance', () => {
      this.window?.show();
      this.window?.focus();
    });
  }
  private message(error: unknown): string {
    return (
      error instanceof z.ZodError
        ? (error.issues[0]?.message ?? 'Invalid input.')
        : error instanceof Error
          ? error.message
          : 'Unknown error'
    ).replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]');
  }
  private handle<T extends z.ZodType>(
    name: string,
    schema: T,
    handler: (args: z.output<T>) => Promise<unknown>,
  ): void {
    ipcMain.handle(`studio:${name}`, async (event, ...args: unknown[]) => {
      if (
        event.sender !== this.window?.webContents ||
        event.senderFrame !== this.window.webContents.mainFrame
      )
        throw new Error('Invalid IPC sender.');
      try {
        return await handler(schema.parse(args));
      } catch (error) {
        // The original cause may contain credentials and must not cross the IPC boundary.
        // eslint-disable-next-line preserve-caught-error
        throw new Error(this.message(error));
      }
    });
  }
  private publish(run: Run): void {
    if (this.window && !this.window.isDestroyed()) this.window.webContents.send('studio:run', run);
  }
  private createWindow(): void {
    const directory = path.dirname(fileURLToPath(import.meta.url));
    const window = new BrowserWindow({
      width: 1440,
      height: 940,
      minWidth: 1050,
      minHeight: 720,
      title: 'Collection Studio',
      backgroundColor: '#252526',
      show: false,
      webPreferences: {
        preload: path.join(directory, '../preload/index.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.window = window;
    window.webContents.setWindowOpenHandler(({ url }) => {
      const target = new URL(url);
      if (target.origin === 'https://miro.com' && target.pathname.startsWith('/app/board/'))
        void shell.openExternal(target.href);
      return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) =>
      callback(false),
    );
    window.once('ready-to-show', () => window.show());
    if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL)
      void window.loadURL(process.env.ELECTRON_RENDERER_URL);
    else void window.loadFile(path.join(directory, '../renderer/index.html'));
  }
}

void new DesktopApplication().init().catch((error) => {
  dialog.showErrorBox(
    'Collection Studio',
    error instanceof Error ? error.message.replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]') : 'Startup failed',
  );
  app.quit();
});
