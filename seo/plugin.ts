import type { Plugin } from 'vite';
import { ASSEMBLY, CLOSE, CODE, COMPOSE, HERO, PARAMS, SELECT, SIM, VERIFY } from '../src/content';
import { DOCS_URL, GITHUB_REPO, GITHUB_URL, PAPER_URL, PYPI_URL } from '../src/style/tokens';

/**
 * SEO that adds nothing a visitor sees.
 *
 * The page is one scroll-driven canvas whose words are all React-rendered, so the HTML that
 * crawlers fetch first is an empty <div id="root">. This plugin puts the same words, in
 * semantic HTML, into that div at build time, taken from src/content.ts so they cannot drift
 * from what is on screen; React replaces them when the app mounts. It also emits the
 * structured data and the sitemap.
 */

export const SITE = 'https://physpace.dev';
export const SITE_NAME = 'SimpleCADAPI';

const CHAPTERS = [CODE, SELECT, VERIFY, PARAMS, ASSEMBLY, SIM, COMPOSE];
/** Footer sentence, as the Footer component prints it. */
const FOOTER = 'An OCP-native Python CAD SDK for agents. Research artifact of the CADIR paper. Built by PhySpace.';

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The page's words as semantic HTML: one h1, one h2 per chapter, the links of the footer. */
export function staticContent(): string {
  const chapters = CHAPTERS.map(
    (chapter) =>
      `<section><h2>${escape(chapter.title)}</h2><p><strong>${escape(chapter.label)}.</strong> ${escape(chapter.body)}</p></section>`,
  ).join('');
  return (
    '<div class="seo-static">' +
    `<header><p>${escape(HERO.kicker)}</p><h1>${escape(HERO.lines.join(' '))}</h1><p>${escape(HERO.body)}</p>` +
    `<p>Install: <code>${escape(HERO.install)}</code></p>` +
    `<p>Paste this to your coding agent: <code>${escape(HERO.prompt)}</code> ` +
    `(<a href="${SITE}/sca/landing.md">the script it reads</a>)</p></header>` +
    `<main>${chapters}<section><h2>${escape(CLOSE.lines.join(' '))}</h2><p>${escape(CLOSE.body)}</p></section></main>` +
    `<footer><p>${escape(FOOTER)}</p><nav>` +
    `<a href="${GITHUB_URL}">GitHub</a> <a href="${PYPI_URL}">PyPI</a> <a href="${DOCS_URL}">Docs</a> ` +
    `<a href="${PAPER_URL}">CADIR · arXiv 2608.00891</a> <a href="${GITHUB_URL}/tree/master/examples">Examples</a>` +
    '</nav></footer></div>'
  );
}

/** Styles for that block: out of sight (still in the document) for visitors with scripts,
 * a plain readable page for those without. */
const STYLE =
  '<style>.seo-static{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}</style>' +
  '<noscript><style>body{background:#000;color:#fff}.seo-static{position:static;width:auto;height:auto;margin:0;padding:24px;overflow:visible;clip:auto;white-space:normal;font:16px/1.6 ui-monospace,monospace;max-width:70ch}.seo-static a{color:#fff}</style></noscript>';

/** schema.org description of the site, the organisation, the software and the paper. */
export function structuredData(): string {
  const description = `${HERO.body}`;
  const graph = [
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      url: `${SITE}/`,
      name: SITE_NAME,
      description,
      inLanguage: 'en',
      publisher: { '@id': `${SITE}/#org` },
    },
    {
      '@type': 'Organization',
      '@id': `${SITE}/#org`,
      name: 'PhySpace',
      url: `${SITE}/`,
      sameAs: ['https://github.com/PhySpace'],
    },
    {
      '@type': ['SoftwareSourceCode', 'SoftwareApplication'],
      '@id': `${SITE}/#software`,
      name: SITE_NAME,
      description: 'An OCP-native Python CAD SDK for agents: models as notebooks, selection by meaning, measured error feedback, solved assemblies, and one package for every solver.',
      url: `${SITE}/`,
      codeRepository: GITHUB_URL,
      programmingLanguage: 'Python',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'macOS, Linux, Windows',
      license: 'https://www.apache.org/licenses/LICENSE-2.0',
      isAccessibleForFree: true,
      installUrl: PYPI_URL,
      sameAs: [GITHUB_URL, PYPI_URL, PAPER_URL],
      author: { '@id': `${SITE}/#org` },
      citation: {
        '@type': 'ScholarlyArticle',
        name: 'CADIR: A Cross-Backend Editable Intermediate Representation for Agentic CAD Generation',
        url: PAPER_URL,
      },
    },
  ];
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
}

export function sitemap(date: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `  <url>\n    <loc>${SITE}/</loc>\n    <lastmod>${date}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n` +
    '</urlset>\n'
  );
}

export function seoPlugin(): Plugin {
  return {
    name: 'sca-seo',
    transformIndexHtml(html) {
      const head = `${STYLE}<script type="application/ld+json">${structuredData()}</script>`;
      return html.replace('</head>', `${head}\n  </head>`).replace('<div id="root"></div>', `<div id="root">${staticContent()}</div>`);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap(new Date().toISOString().slice(0, 10)) });
    },
  };
}

export { GITHUB_REPO };
