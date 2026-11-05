# Sign PDF

אתר ציבורי ופשוט לחתימה גרפית על מסמכי PDF.

- המסמך והחתימה מעובדים מקומית בדפדפן.
- אין העלאה לשרת ואין צורך בחשבון משתמש.
- ניתן לצייר חתימה, למקם אותה על כל עמוד ולהוריד PDF חתום.

האתר משתמש ב-pdf.js להצגה וב-pdf-lib ליצירת הקובץ החתום.

## SignWay branding

The selected concept 1 (white pen and winding S road on blue) is in `icons/signway-logo.png`. Installation icons, favicon and Apple touch icon derive from this master. The maskable icon keeps the complete mark inside its safe area. The manifest id, start URL and scope stay unchanged to preserve installed app identity.

## Self-signing

Choose a PDF and select **Sign it myself**, position the signature and draw it, then prepare the signed PDF. Save downloads the file. Send opens the device share sheet with the signed PDF attached, where the user chooses email or WhatsApp and completes delivery. Unsupported browsers keep Save available with manual-attachment instructions. This local flow creates no signing request and does not upload the PDF. A changed or removed signature invalidates the prepared output.
