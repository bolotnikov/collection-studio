import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { chapters } from './src/data/chapters.js';

export default defineConfig({
  site: process.env.DOCS_SITE ?? 'http://localhost:4321',
  base: process.env.DOCS_BASE ?? '/',
  output: 'static',
  devToolbar: { enabled: false },
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'Collection Studio',
      favicon: '/favicon.png',
      head: [
        {
          tag: 'link',
          attrs: {
            rel: 'apple-touch-icon',
            href: `${(process.env.DOCS_BASE ?? '/').replace(/\/$/, '')}/apple-touch-icon.png`,
          },
        },
      ],
      description:
        'От исследования референсов до готовой коллекции. Документация проекта.',
      defaultLocale: 'root',
      locales: { root: { label: 'Русский', lang: 'ru' } },
      customCss: ['./src/styles/handbook.css'],
      components: {
        Header: './src/components/Header.astro',
        PageTitle: './src/components/PageTitle.astro',
        Pagination: './src/components/Pagination.astro',
        Footer: './src/components/Footer.astro',
        ThemeProvider: './src/components/ThemeProvider.astro',
        ThemeSelect: './src/components/ThemeToggle.astro',
        MobileMenuFooter: './src/components/MobileMenuFooter.astro',
      },
      sidebar: [
        { label: 'Обзор проекта', link: '/' },
        ...chapters.map((chapter) => ({
          label: `${chapter.number} · ${chapter.title}`,
          collapsed: true,
          items: [
            { label: 'О разделе', link: `/${chapter.slug}/` },
            ...chapter.topics.map((topic) => ({
              label: topic.title,
              link: `/${chapter.slug}/${topic.slug}/`,
            })),
          ],
        })),
      ],
      tableOfContents: false,
      editLink: undefined,
      lastUpdated: false,
      credits: false,
    }),
  ],
});
