# Bundled browser dependencies

These unmodified, pinned distributions are served from the same origin as the app so startup and cached PDF tools do not depend on a third-party CDN.

- pdfjs-dist 3.11.174: build/pdf.min.js and build/pdf.worker.min.js (Apache-2.0).
- pdf-lib 1.17.1: dist/pdf-lib.min.js (MIT).
- @supabase/supabase-js 2.106.2: dist/umd/supabase.js (MIT).

Source: https://cdn.jsdelivr.net/npm/ with the exact package versions above. License texts are included alongside these files. Update the service worker cache version whenever changing a bundled dependency.
