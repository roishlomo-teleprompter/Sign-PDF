# SignWay - חתימה בדרך

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
