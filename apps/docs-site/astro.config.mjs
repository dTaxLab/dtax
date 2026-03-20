import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://dtax.dev',
  integrations: [
    starlight({
      title: 'dTax Developer Hub',
      description: 'Open-source crypto tax engine. 23 exchange parsers, FIFO/LIFO/HIFO, Form 8949.',
      logo: {
        light: './src/assets/logo-light.svg',
        dark: './src/assets/logo-dark.svg',
        replacesTitle: false,
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/dTaxLab/dtax' },
      ],
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', slug: 'introduction' },
            { label: 'Quick Start', slug: 'quickstart' },
          ],
        },
        {
          label: 'Tax Engine',
          items: [
            { label: 'Overview', slug: 'tax-engine/overview' },
            { label: 'Exchange Parsers', slug: 'tax-engine/parsers' },
            { label: 'Cost Basis Methods', slug: 'tax-engine/cost-basis' },
            { label: 'Reports', slug: 'tax-engine/reports' },
          ],
        },
        {
          label: 'REST API',
          items: [
            { label: 'Overview', slug: 'api/overview' },
            { label: 'Authentication', slug: 'api/authentication' },
          ],
        },
        {
          label: 'Resources',
          items: [
            { label: 'CSV Format Guide', slug: 'resources/csv-format' },
            { label: 'Open Core License', slug: 'resources/license' },
          ],
        },
      ],
      head: [
        {
          tag: 'meta',
          attrs: { property: 'og:image', content: 'https://dtax.dev/og.png' },
        },
      ],
    }),
  ],
  output: 'static',
});
