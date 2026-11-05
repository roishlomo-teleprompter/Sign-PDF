# Sign PDF

אתר ציבורי ופשוט לחתימה גרפית על מסמכי PDF.

- המסמך והחתימה מעובדים מקומית בדפדפן.
- אין העלאה לשרת ואין צורך בחשבון משתמש.
- ניתן לצייר חתימה, למקם אותה על כל עמוד ולהוריד PDF חתום.

האתר משתמש ב-pdf.js להצגה וב-pdf-lib ליצירת הקובץ החתום.

## Workspace design and optional attachments

The event workspace has a responsive blue/white design with dashboard cards, participant progress, expandable response details, history navigation and CSV response exports. Existing Google account, Gmail delivery, contact-group and PDF upload workflows are retained.

Optional recipient PDF attachments require the separately approved migration in [supabase/ATTACHMENTS.md](supabase/ATTACHMENTS.md). Apply and verify that migration before publishing the attachment-enabled frontend.
