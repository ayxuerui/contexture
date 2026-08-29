import { stat } from 'node:fs/promises';
import path from 'node:path';
import { catalogSectionPath, checkCatalogCoverage } from '../catalog/build.js';
import { catalogSectionsFor } from '../catalog/model.js';
import type { Finding } from '../envelope.js';
import { defineCheck } from './types.js';

export const catalogCoverageCheck = defineCheck({
  id: 'catalog.coverage',
  title: 'Every retrievable note has a catalog entry',
  severity: 'invariant',
  capability: 'context-catalog',
  scopes: ['store'],
  async run(ctx) {
    const store = { root: ctx.storeRoot, config: ctx.config };
    const { missing, dangling } = await checkCatalogCoverage(store);
    const findings: Finding[] = [
      ...missing.map((notePath) => ({
        code: 'catalog.coverage.missing',
        severity: 'error' as const,
        message: `"${notePath}" is retrievable but has no catalog entry.`,
        subject: notePath,
      })),
      ...dangling.map((notePath) => ({
        code: 'catalog.coverage.dangling',
        severity: 'error' as const,
        message: `A catalog entry references "${notePath}", which no longer exists.`,
        subject: notePath,
      })),
    ];
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

export const catalogSectionSizeCheck = defineCheck({
  id: 'catalog.section_size',
  title: 'No catalog section exceeds its configured size budget',
  severity: 'invariant',
  capability: 'context-catalog',
  scopes: ['store'],
  async run(ctx) {
    const store = { root: ctx.storeRoot, config: ctx.config };
    const sections = catalogSectionsFor(ctx.config);
    const findings: Finding[] = [];
    for (const section of sections) {
      const filePath = catalogSectionPath(store, section);
      let size = 0;
      try {
        size = (await stat(filePath)).size;
      } catch {
        continue; // section file doesn't exist yet — nothing to measure
      }
      if (size > ctx.config.catalog.section_max_bytes) {
        findings.push({
          code: 'catalog.section_size.exceeded',
          severity: 'error',
          message: `Catalog section "${section.id}" (${path.relative(store.root, filePath)}) is ${size} bytes, exceeding the configured budget of ${ctx.config.catalog.section_max_bytes}. Split it.`,
          subject: section.id,
          details: { size, budget: ctx.config.catalog.section_max_bytes },
        });
      }
    }
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

export const CATALOG_CHECKS = [catalogCoverageCheck, catalogSectionSizeCheck];
