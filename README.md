# Sign Away

אפליקציית רשת ליצירת בקשות חתימה, חתימה על PDF ושיתוף מסמכים.

- התחברות בעלי מסמכים מתבצעת באמצעות Google.
- מסמכים, חתימות, אנשי קשר, קבוצות ובקשות נשמרים ב־Drive האישי של המשתמש.
- Google Apps Script מטפל בהרשאות, ניתוב ועיבוד חתימות; נתוני חיבור נשמרים גם בשירות.
- נמענים משתמשים בקישור חתימה אישי. במסמך משותף החתימות מצטברות באותו PDF.
- הרשאת Gmail לשליחה היא אופציונלית ונפרדת. יצירת בקשה אינה שולחת הזמנות אוטומטית.

## Build and publication

`npm ci` installs test dependencies; `npm test` runs the regression suite.
`npm run build` creates the Google-only static site in `dist/`.
`.github/workflows/pages.yml` publishes only that directory.

Historical adapters, SQL and migration sources stay in Git for reference and recovery;
they are excluded from the published site. Retired preview/migration pages redirect
to the current app without loading the previous identity SDK.

See [GOOGLE-ONLY-ROLLOUT.md](GOOGLE-ONLY-ROLLOUT.md) for deployment details, the verified
55-file owner migration and outstanding acceptance/history checks.


### Automatic interface translation

The production build extracts `tr(he, en)` calls and `data-he` / `data-en` labels into a versioned public UI catalog. Expressions in messages become placeholders; user content is never included in the catalog. Apps Script LanguageApp translates the catalog on first selection of a language; results are cached in the browser and service. Hebrew and English are bundled originals. The build adds new and changed UI strings automatically on every deployment.

All future interface text must use the existing `tr(he, en)` or paired data attributes. Do not translate uploaded documents, names, contacts, typed messages or signing links. Unavailable translations fall back to English. Automated translation needs human review for important wording and does not establish legal validity in any jurisdiction.

Languages: he, en, es, pt-BR, fr, de, ar, ja, ko, zh-CN, ru. The service accepts catalog identifiers only, and reads the application's fixed public catalog URL. It does not accept arbitrary translation text or URLs. No new API key or Cloud billing configuration is used. Existing Apps Script quotas apply.


The first language choice follows the device's ordered language preferences, falling back to English when none are supported. Legacy automatic account defaults do not override the device. Successful manual selections are saved separately on that device and reused on later opens. A native-language download dialog appears only for missing translations; cached languages switch without the dialog.

### Personal signature library

`signature-studio.js` provides drawing with adjustable local stroke smoothing,
typed full names and initials, and an explicit original/preview approval step.
The profile menu opens the private library. Saving for reuse is opt-in; guests
can sign without creating a library or account. Hebrew handwriting and Latin
handwriting fonts are bundled locally with their SIL OFL licenses in `fonts/`.
User-entered names, initials and drawn strokes are never translation inputs.

`google-drive-backend/Signatures.gs` stores up to 12 signatures and their editable
source data in the authenticated account's personal Drive workspace manifest.
Library operations are owner-only and are unavailable through recipient tokens.
The existing document-signing flow still requires a separate explicit submission.
Deploy the backend including `Signatures.gs` before releasing the new frontend.
