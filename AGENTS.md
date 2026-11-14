# SignWay interface changes

- All new or changed user-facing interface text must use `tr(he, en)` with English UI literals, or paired `data-he` and `data-en` attributes. Do not introduce untranslated labels, dialogs, status messages, placeholders or accessibility labels.
- Do not wrap arbitrary user input in translation helpers. Uploaded documents, names, contacts, typed messages and signing links must never be sent for translation.
- `scripts/localize.cjs` extracts UI text and placeholders during every production build. `i18n.js` and the Apps Script translation service handle supported languages automatically. Do not maintain separate hand-edited full translation files for every change.
- Keep both Hebrew and Arabic right-to-left; use the selected locale for dates. Keep the SignWay brand unchanged.
- Preserve Google-only identity and personal Drive storage.
- Run `npm test` and build into a new empty destination before publishing. Production deployment regenerates the catalog and the service-worker cache revision automatically.
