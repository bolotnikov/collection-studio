import { RetrievalConfiguration } from '../shared/RetrievalConfiguration';
import { PromptCatalog } from '../application/prompts/PromptCatalog';
import { SetContract } from '../shared/SetContract';
import type { Profile } from '../shared/Contracts';
import { SourceKnowledgeStore } from '../infrastructure/SourceKnowledgeStore';
import { CodexSourceContext } from '../infrastructure/style/CodexSourceContext';
import { ReferenceLibrary } from '../infrastructure/ReferenceLibrary';
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
import { OpenAiProvider } from '../infrastructure/OpenAiProvider';
import { RunService } from '../application/RunService';
import { ExportService } from '../infrastructure/ExportService';
import { SettingsStore } from './SettingsStore';
import { AssetProtocol } from './AssetProtocol';
import { CodexRunner } from '../infrastructure/CodexRunner';
import { CodexProvider } from '../infrastructure/CodexProvider';

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
    await settings.init(app.isPackaged ? undefined : process.cwd());
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
    const profile = Contracts.profile.parse({
      ...JSON.parse(await fs.readFile(path.join(resources, 'style-profile.json'), 'utf8')),
      knowledge,
      promptCatalog: prompts.values,
      retrievalConfig: new RetrievalConfiguration(
        JSON.parse(await fs.readFile(path.join(resources, 'retrieval-config.json'), 'utf8')),
      ).values,
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
    const repository = new RunRepository(runsRoot),
      images = new ImageFiles();
    await repository.recover();
    const prepareStyle = (policy: ProductionPolicy, sourceProfile: Profile = profile) =>
      new CodexStylePreparation(
        new CodexRunner(
          codexExecutable,
          path.join(runsRoot, '_codex-jobs'),
          settings.settings.codexModel,
          new PromptCatalog(sourceProfile.promptCatalog),
        ),
        structuredClone(library.items),
        referenceRoot,
        path.join(app.getPath('userData'), 'reference-analysis'),
        settings.settings.codexModel,
        policy,
        new PromptCatalog(sourceProfile.promptCatalog),
        sourceProfile.retrievalConfig,
      );
    const service = new RunService(
      repository,
      images,
      profile,
      referenceRoot,
      (s, sourceProfile) => {
        const templates = new PromptCatalog(sourceProfile.promptCatalog);
        if (s.provider === 'codex') {
          if (!codexReady) throw new Error('Connect Codex CLI with ChatGPT in Settings.');
          return new CodexProvider(
            new CodexRunner(codexExecutable, path.join(runsRoot, '_codex-jobs'), s.codexModel, templates),
            templates,
          );
        }
        return new OpenAiProvider(settings.credential(), s.imageModel, s.textModel, templates);
      },
      (r) => this.publish(r),
      (policy, sourceProfile) => {
        if (!codexReady) throw new Error('Connect Codex with ChatGPT for reference analysis.');
        return prepareStyle(policy, sourceProfile);
      },
      (sourceProfile) =>
        new CodexSourceContext(
          new CodexRunner(
            codexExecutable,
            path.join(runsRoot, '_codex-jobs'),
            settings.settings.codexModel,
            new PromptCatalog(sourceProfile.promptCatalog),
          ),
          knowledgeStore.root,
          path.join(app.getPath('userData'), 'source-analysis'),
          settings.settings.codexModel,
          new PromptCatalog(sourceProfile.promptCatalog),
        ),
      planningPolicy,
    );
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
      const catalog = await prepareStyle(library.policy).catalog();
      return {
        runs: await repository.list(),
        profile,
        settings: settings.settings,
        hasKey: settings.hasKey,
        codexReady,
        referenceCount,
        dataPath: runsRoot,
        productionPolicy: library.policy,
        anchorReferences: catalog.filter((item) => item.origin === 'anchor'),
        userReferences: catalog.filter((item) => item.origin === 'user'),
      };
    });
    this.handle('start', z.tuple([Contracts.brief]), async ([brief]) => {
      if (!codexReady) throw new Error('Connect Codex with ChatGPT for reference analysis.');
      if (referenceCount !== profile.references.length || referenceCount < 4)
        throw new Error('Prepare the style references before generating.');
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
    });
    this.handle('removeReference', z.tuple([z.string().min(1)]), async ([id]) => library.remove(id));
    this.handle('pause', z.tuple([Contracts.id]), ([id]) => service.pause(id));
    this.handle('resume', z.tuple([Contracts.id]), ([id]) =>
      service.resume(id, structuredClone(library.policy)),
    );
    this.handle(
      'retry',
      z.tuple([Contracts.id, Contracts.id, z.string().max(2000)]),
      ([id, card, instruction]) => service.retry(id, card, instruction, structuredClone(library.policy)),
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
    this.handle('export', cardRef, async ([id, variantId]) => {
      const run = await repository.get(id);
      const result = await dialog.showSaveDialog({
        title: this.translator.t('Export set'),
        defaultPath: `collection-${id.slice(0, 8)}.zip`,
        filters: [{ name: this.translator.t('ZIP archive'), extensions: ['zip'] }],
      });
      if (result.canceled || !result.filePath) return null;
      await new ExportService(images).export(run, variantId, repository.directory(id), result.filePath);
      return result.filePath;
    });
    this.handle('saveSettings', z.tuple([Contracts.settings, z.string().max(512)]), async ([value, key]) => {
      await settings.save(value, key);
      await refreshCodex();
    });
    this.handle('checkConnection', z.tuple([]), async () => {
      try {
        if (settings.settings.provider === 'codex') {
          await refreshCodex();
          return { ok: true, message: await CodexRunner.check(codexExecutable) };
        }
        return {
          ok: true,
          message: await new OpenAiProvider(
            settings.credential(),
            settings.settings.imageModel,
            settings.settings.textModel,
          ).check(),
        };
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
    return (error instanceof Error ? error.message : 'Unknown error').replace(
      /sk-[A-Za-z0-9_-]+/g,
      '[REDACTED]',
    );
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
