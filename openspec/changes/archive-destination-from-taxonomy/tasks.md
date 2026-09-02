## 1. Taxonomy

- [x] 1.1 Add optional `archiveDestination` to `TaxonomyProfile`; declare `archives/` on PARA only.
- [x] 1.2 Thread it through `ResolvedTaxonomy` and all four `resolveTaxonomy` return paths via a single `fromProfile` helper.

## 2. Config

- [x] 2.1 Rename `DEFAULT_ARCHIVE_PATH` to `DEFAULT_ARCHIVE_DESTINATION`.
- [x] 2.2 Give `OrganizeSchema` a fallback transform accepting `archive_path`, resolving to `archive_destination`.
- [x] 2.3 Bump `SUPPORTED_SCHEMA_VERSION` to 6.
- [x] 2.4 Seed `organize.archive_destination` from the resolved profile in `init`.

## 3. Migration

- [x] 3.1 Add migration `0006-archive-destination-from-taxonomy` and register it.
- [x] 3.2 Cover the branches: PARA on the default, an operator-set value, a profile declaring none, a custom taxonomy, an existing `archive/` directory, an absent one, and a second application.

## 4. Consumers

- [x] 4.1 Update `archive`, `convention-doc`'s `__ARCHIVE_DESTINATION__` placeholder, and the baseline convention template.
- [x] 4.2 Rename the fixture key across the unit-test suite.

## 5. Verification

- [x] 5.1 `npm run typecheck` and the canonical `test/` suite pass.
- [x] 5.2 A fresh `--profile para` store is born with `archives/`; `diataxis`, `zettelkasten`, and a custom taxonomy with `archive/`.
