import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';

/** Stage and verify the complete download before replacing the canonical local release. */
class MacReleasePackage {
  private readonly execute = promisify(execFile);
  private readonly archiveName = 'Collection-Studio-mac-universal.zip';

  async run(): Promise<void> {
    if (process.platform !== 'darwin' || process.arch !== 'arm64')
      throw new Error('Package this validated release on an Apple Silicon Mac.');
    const root = process.cwd();
    const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'collection-studio-package-'));
    try {
      const project = path.join(staging, 'project');
      await fs.mkdir(project);
      for (const file of ['package.json', 'package-lock.json', 'out', 'resources'])
        await fs.cp(path.join(root, file), path.join(project, file), { recursive: true });
      console.log('Installing isolated production dependencies for both Mac architectures…');
      await this.execute(
        'npm',
        ['ci', '--omit=dev', '--ignore-scripts', '--os=darwin', '--cpu=arm64', '--no-audit', '--no-fund'],
        { cwd: project, maxBuffer: 8 * 1024 * 1024 },
      );
      const lock = z
        .object({
          packages: z.record(
            z.string(),
            z.object({ version: z.string(), integrity: z.string().optional() }).passthrough(),
          ),
        })
        .parse(JSON.parse(await fs.readFile(path.join(project, 'package-lock.json'), 'utf8')));
      for (const name of ['@img/sharp-darwin-x64', '@img/sharp-libvips-darwin-x64']) {
        const entry = lock.packages[`node_modules/${name}`];
        if (!entry?.integrity) throw new Error(`Missing locked native dependency: ${name}`);
        const packed = await this.execute(
          'npm',
          ['pack', `${name}@${entry.version}`, '--ignore-scripts', '--json', '--pack-destination', staging],
          { cwd: staging, maxBuffer: 1024 * 1024 },
        );
        const [artifact] = z
          .array(z.object({ filename: z.string(), integrity: z.string() }))
          .length(1)
          .parse(JSON.parse(packed.stdout));
        if (!artifact || artifact.integrity !== entry.integrity)
          throw new Error(`Native dependency integrity mismatch: ${name}`);
        const destination = path.join(project, 'node_modules', name);
        await fs.mkdir(destination, { recursive: true });
        await this.execute('/usr/bin/tar', [
          '-xzf',
          path.join(staging, artifact.filename),
          '--strip-components=1',
          '-C',
          destination,
        ]);
      }
      const electron = lock.packages['node_modules/electron'];
      if (!electron) throw new Error('Missing locked Electron version.');
      const output = path.join(staging, 'build');
      console.log('Packaging universal Electron runtime and architecture-specific image libraries…');
      await this.execute(
        process.execPath,
        [
          path.join(root, 'node_modules/electron-builder/cli.js'),
          '--mac',
          '--dir',
          '--universal',
          '--projectDir',
          project,
          '--config.npmRebuild=false',
          `--config.electronVersion=${electron.version}`,
          '--config.mac.minimumSystemVersion=13.0',
          '--config.mac.x64ArchFiles=**/node_modules/@img/**',
          '--publish',
          'never',
          `--config.directories.output=${output}`,
          '--config.mac.identity=-',
        ],
        { cwd: root, maxBuffer: 8 * 1024 * 1024 },
      );
      const bundle = path.join(output, 'mac-universal/Collection Studio.app');
      console.log('Verifying universal executable, signature and resources…');
      await this.execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
      await this.execute('/usr/bin/lipo', [
        path.join(bundle, 'Contents/MacOS/Collection Studio'),
        '-verify_arch',
        'x86_64',
        'arm64',
      ]);
      for (const arch of ['arm64', 'x64']) {
        const bindings = await fs.readdir(
          path.join(
            bundle,
            `Contents/Resources/app.asar.unpacked/node_modules/@img/sharp-darwin-${arch}/lib`,
          ),
        );
        if (!bindings.some((file) => file.startsWith(`sharp-darwin-${arch}-`) && file.endsWith('.node')))
          throw new Error(`Missing sharp native binding for ${arch}`);
        const files = await fs.readdir(
          path.join(
            bundle,
            `Contents/Resources/app.asar.unpacked/node_modules/@img/sharp-libvips-darwin-${arch}/lib`,
          ),
        );
        if (!files.some((file) => /^libvips-cpp.*\.dylib$/.test(file)))
          throw new Error(`Missing libvips for ${arch}`);
      }
      for (const resource of [
        'app.asar',
        'knowledge/visual-catalog.json',
        'references',
        'prompts/production.json',
      ])
        await fs.access(path.join(bundle, 'Contents/Resources', resource));
      const payload = path.join(staging, 'payload');
      await fs.mkdir(payload);
      await fs.rename(bundle, path.join(payload, 'Collection Studio.app'));
      await fs.copyFile(path.join(root, 'docs/FIRST_LAUNCH.txt'), path.join(payload, 'START-HERE.txt'));
      const archive = path.join(staging, this.archiveName);
      console.log('Compressing and testing the download archive…');
      await this.execute('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', payload, archive]);
      await this.execute('/usr/bin/unzip', ['-tq', archive], { maxBuffer: 8 * 1024 * 1024 });
      const digest = createHash('sha256')
        .update(await fs.readFile(archive))
        .digest('hex');
      const release = path.join(root, 'release');
      const nextRelease = path.join(staging, 'release');
      const canonical = path.join(nextRelease, 'mac-arm64');
      await fs.mkdir(canonical, { recursive: true });
      await fs.rename(
        path.join(payload, 'Collection Studio.app'),
        path.join(canonical, 'Collection Studio.app'),
      );
      await fs.rename(archive, path.join(nextRelease, this.archiveName));
      await fs.writeFile(path.join(nextRelease, 'SHA256SUMS.txt'), `${digest}  ${this.archiveName}\n`);
      const previous = path.join(staging, 'previous');
      let hadPrevious = false;
      try {
        await fs.rename(release, previous);
        hadPrevious = true;
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
      try {
        await fs.rename(nextRelease, release);
      } catch (error) {
        if (hadPrevious) await fs.rename(previous, release);
        throw error;
      }
      console.log(`Verified download: ${path.join(release, this.archiveName)}`);
      console.log(`SHA-256: ${digest}`);
      console.log(
        'Ad-hoc signed only; Apple Developer ID signing and notarization are still required for trusted distribution.',
      );
    } finally {
      await fs.rm(staging, { recursive: true, force: true });
    }
  }
}

await new MacReleasePackage().run();
