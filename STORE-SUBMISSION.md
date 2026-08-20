# Microsoft Store submission guide — Bilim Hezinisi

Everything in this file is about getting `BilimHezinisi-desktop` onto the Microsoft
Store as a **free** download. Work through it top to bottom.

Repository: <https://github.com/kelemdepter-rgb/BilimHezinisi-desktop>

## Published

**Live in the Microsoft Store:** <https://apps.microsoft.com/detail/9N2T15L4DX86>

| | |
| --- | --- |
| Store ID | `9N2T15L4DX86` |
| Package identity | `BilimHezinisi.BilimHezinisi` |
| Version | 3.1.0 |
| Submission 1 | passed certification on **2026-08-20** |

The procedure below is kept for future submissions and updates.

---

## 0. Why MSIX and not the .exe installer

The Store accepts two kinds of desktop submission:

| Route | Package | Code-signing certificate | Cost |
| --- | --- | --- | --- |
| **MSIX / AppX** (what we use) | `.appx` built by electron-builder | **Not needed** — the Store signs the package for you during publishing | **$0** |
| EXE/MSI (policy 10.2.9) | your existing NSIS `.exe` hosted on your own HTTPS URL | **Required** — every PE file must be signed by a certificate from a Microsoft Trusted Root CA | roughly $200–400 per year |

So the MSIX route is the only free one. The NSIS installer and the portable
`.exe` stay exactly as they are for GitHub Releases — nothing about them
changes.

---

## 1. Create the developer account (free)

1. Go to <https://partner.microsoft.com/dashboard/registration> and sign in
   with a Microsoft account.
2. Choose **Individual**. Since September 2025 individual registration is
   **free** — there is no longer a one-time fee.
3. Complete identity verification. Have a government ID ready; verification is
   usually done within a few days.
4. **Publisher display name: `Bilim Hezinisi`**

> Pick Individual, not Company. Company accounts require business documents,
> and this app collects no financial data, so Individual is correct
> (Store policy 10.14).

---

## 2. Reserve the app name

Reserve **two** names. Reservations are free and unlimited.

**First, create the product with the Latin name.** Partner Center →
**Apps and games** → **New product** → **MSIX or PWA app** → reserve:

```
Bilim Hezinisi
```

Create the product with this one, because `Package/Identity/Name` is derived
from the name the product is created with and **can never be changed
afterwards**. Starting from ASCII guarantees a clean identity. Users never see
it.

**Then add the Uyghur name.** Inside the product → **Product management** →
**Manage app names** → *Reserve more names* → paste (do not retype):

```
بىلىم خەزىنىسى
```

This second name is the one customers will see. It **must** match
`build.appx.displayName` in `package.json` byte for byte, or the package upload
fails with *"The name found in the package is not one of your reserved app
names."*

If `Bilim Hezinisi` is taken, try `Bilim Hezinisi - Uyghur Library`.

---

## 3. Copy the three identity values

Partner Center → your app → **Product management** → **Product identity**.
You will see something like:

```
Package/Identity/Name          12345BilimHezinisi.BilimHezinisi
Package/Identity/Publisher     CN=A1B2C3D4-5E6F-7890-ABCD-EF1234567890
Package/Properties/PublisherDisplayName   Bilim Hezinisi
```

Open `package.json` and replace the placeholders in `build.appx`:

```json
"appx": {
  "identityName": "12345BilimHezinisi.BilimHezinisi",
  "publisher": "CN=A1B2C3D4-5E6F-7890-ABCD-EF1234567890",
  "publisherDisplayName": "Bilim Hezinisi",
  ...
}
```

These three strings must match Partner Center **character for character**, or
the upload is rejected.

Leave the rest of the block alone. In particular:

| Field | Value | Why |
| --- | --- | --- |
| `displayName` | `بىلىم خەزىنىسى` | Shown in the Store and after install. Must be a reserved name. |
| `publisherDisplayName` | `Bilim Hezinisi` | Must equal the Partner Center publisher display name. |
| `applicationId` | `BilimHezinisi` | Internal identifier; must stay ASCII. |
| `artifactName` | `BilimHezinisi-Store-${version}.appx` | A file name; must stay ASCII. |
| `languages` | `["ug-arab", "en-US"]` | `ug-arab` is Uyghur in Arabic script. Plain `ug` is **not** on the Store's supported-language list and can fail certification. |

---

## 4. Build the package

On Windows:

```powershell
npm install
npm run fetch-ocr-models
npm run dist-store
```

Output: `dist\BilimHezinisi-Store-3.1.0.appx`

Keep `npm run dist` for the GitHub Releases build — it still produces the NSIS
installer and the portable `.exe`.

### Testing the package before you upload

The `.appx` above is unsigned, so Windows will not install it directly. To test
locally, build a copy signed with a self-made certificate:

```powershell
New-SelfSignedCertificate -Type Custom -Subject "CN=A1B2C3D4-5E6F-7890-ABCD-EF1234567890" `
  -KeyUsage DigitalSignature -FriendlyName "BilimHezinisi Test" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
```

Export it as a `.pfx`, sign the package with `signtool sign /fd SHA256 /a /f
test.pfx /p <password> BilimHezinisi-Store-3.1.0.appx`, install the certificate
into **Trusted People**, then `Add-AppxPackage`. Never commit the `.pfx` — it
is already in `.gitignore`.

**What to check while testing:** the app opens; a book imports; full-text
search works; OCR works; the Qur'an module loads; notes save; export to
PDF/DOCX works; and your library still lives in
`C:\Users\<you>\JamiyKutupxana`.

Upload the **unsigned** package to Partner Center. The Store re-signs it.

---

## 5. Store listing

### Category
**Books & reference** (secondary: Education)

### Title (Product name)

Set the **Product name** dropdown to `بىلىم خەزىنىسى` for **every** language
listing, including the English one. The Store then shows the Uyghur name to
everyone, while the English description keeps the app findable and readable for
non-Uyghur speakers.

### Short description (English, ≤ 200 characters)

> A free offline digital library for Uyghur readers. Import PDF, DOCX and TXT
> books, search inside them, take notes, run OCR, and read the Qur'an — all on
> your own computer.

### Full description (English)

> **Bilim Hezinisi** turns your books into a searchable personal library that
> works without an internet connection.
>
> Built for Uyghur, Arabic, Turkish and English text, it handles right-to-left
> typography and full-text search inside Arabic-script documents properly —
> something most general-purpose readers get wrong.
>
> **Features**
> • Import and read PDF, DOCX, DOC, TXT, MD and HTML, or save an article from a web address
> • Full-text search across your whole library and inside a single book
> • Offline OCR for scanned PDFs and images, with Uyghur-specific correction
> • A notebook with highlighting, a format painter and automatic references back to the page
> • The Qur'an, offline: the Uthmani Hafs Arabic text with the Uyghur translation, searchable
> • Uyghur spell-checking
> • Export to PDF and DOCX with correct Uyghur typography
> • An optional AI assistant — add your own free Google Gemini API key to ask questions about the book you are reading
>
> Completely free. No advertising, no accounts, no tracking. Your library stays
> on your computer.
>
> **This app contains AI-generated content.** The optional AI assistant is
> powered by Google Gemini and only works after you enter your own API key.
> AI answers can be wrong — please check important material, especially
> religious content, against the original sources.

### Full description (Uyghur) — use as the `ug` listing

> **بىلىم خەزىنىسى** ــ كىتابلىرىڭىزنى تورسىز ئىشلەيدىغان، ئىزدىگىلى بولىدىغان
> شەخسىي كۇتۇپخانىغا ئايلاندۇرىدۇ.
>
> ئۇيغۇرچە، ئەرەبچە، تۈركچە ۋە ئىنگلىزچە تېكىستلەرگە ماسلاشتۇرۇلغان بولۇپ،
> ئوڭدىن سولغا يېزىلىش ۋە ئەرەب يېزىقىدىكى ھۆججەتلەر ئىچىدىن ئىزدەشنى توغرا
> بىر تەرەپ قىلىدۇ.
>
> **ئىقتىدارلىرى**
> • PDF، DOCX، DOC، TXT، MD، HTML ھۆججەتلىرىنى ئەكىرىش ۋە ئوقۇش، ياكى تور ئادرېسىدىن ماقالە ساقلاش
> • پۈتۈن كۇتۇپخانا ۋە بىر كىتاب ئىچىدىن تولۇق تېكىست ئىزدەش
> • تورسىز OCR ــ سىكانېرلانغان PDF ۋە رەسىملەردىن خەت تونۇش، ئۇيغۇرچىغا خاس تۈزىتىش بىلەن
> • خاتىرە دەپتىرى ــ رەڭلەش، پىچىم كۆچۈرگۈچ ۋە خاتىرە ئالغان بەتكە ئاپتوماتىك پايدىلىنىش
> • قۇرئان كەرىم ــ ئوسمانىي ھەفس ئەرەبچە تېكىستى ۋە ئۇيغۇرچە تەرجىمىسى، تورسىز ۋە ئىزدىگىلى بولىدۇ
> • ئۇيغۇرچە ئىملا تەكشۈرۈش
> • توغرا ئۇيغۇرچە خەت تىزىلىشى بىلەن PDF ۋە DOCX قىلىپ چىقىرىش
> • ئىختىيارىي سۈنئىي ئىدراك ياردەمچىسى ــ ئۆزىڭىزنىڭ ھەقسىز Google Gemini API ئاچقۇچىنى قوشۇپ، ئوقۇۋاتقان كىتابىڭىز ھەققىدە سوئال سوراڭ
>
> پۈتۈنلەي ھەقسىز. ئېلان يوق، ھېسابات يوق، ئىزلاش يوق. كۇتۇپخانىڭىز ئۆز
> كومپيۇتېرىڭىزدا قالىدۇ.
>
> **بۇ دېتالدا سۈنئىي ئىدراك ھاسىل قىلغان مەزمۇن بار.** سۈنئىي ئىدراك
> ياردەمچىسى Google Gemini غا تايىنىدۇ ۋە پەقەت ئۆزىڭىزنىڭ API ئاچقۇچىنى
> كىرگۈزگەندىلا ئىشلەيدۇ. جاۋابلار خاتا بولۇشى مۇمكىن ــ مۇھىم مەزمۇنلارنى،
> بولۇپمۇ دىنىي مەزمۇنلارنى، چوقۇم ئەسلى مەنبەدىن تەكشۈرۈڭ.

### Search terms (max 7)

`uyghur` · `library` · `quran` · `ebook reader` · `ocr` · `offline` · `kutupxana`

### Screenshots

At least one, at most ten. **1366 × 768** or larger, PNG. Suggested set:

1. Library view with books
2. Reading a book with search results highlighted
3. The Qur'an module
4. The notebook with a highlighted note
5. OCR running on a scanned page
6. The AI assistant panel

### Privacy policy URL — **required**

`https://github.com/kelemdepter-rgb/BilimHezinisi-desktop/blob/main/PRIVACY.md`

(or enable GitHub Pages and use
`https://kelemdepter-rgb.github.io/BilimHezinisi-desktop/PRIVACY.html`)

### Support contact

**kelemdepter@gmail.com** — already filled in throughout `PRIVACY.md`. Enter
the same address in Partner Center under **Contact info**, so that the support
address in the listing matches the one in the privacy policy.

---

## 6. Properties and ratings

**Age rating (IARC questionnaire)** — answer honestly:

| Question | Answer |
| --- | --- |
| Violence, sex, drugs, gambling, profanity | No |
| In-app purchases | No |
| Advertising | No |
| Collects or shares personal information | No |
| Users can interact / user-generated content shared with others | No |
| **Unrestricted internet access** | **Yes** — the app can fetch a web page the user names, and can call the Gemini API |
| **Generative AI (policy 11.16)** | **Yes** — tick "this product contains live generative AI" and say so in the description (already done above) |

Expected result: an "Everyone / 3+" rating.

**Product declarations**
- ✅ This app can be installed on a Windows device without a network connection
- ✅ Free, no in-app purchases
- ❌ Not accessible-certified (unless you have tested it with a screen reader)

**Markets:** all markets.
**Pricing:** Free.

---

## 7. Notes for certification (paste into "Notes for certification")

> Bilim Hezinisi is a free offline digital library for Uyghur-language books.
> No login or account is needed — the reviewer can open the app and use every
> feature immediately.
>
> To test the optional AI assistant, a free Google Gemini API key from
> https://aistudio.google.com must be pasted into Settings → AI. The app is
> fully functional without it; all other features (import, search, OCR,
> notebook, Qur'an, export) work offline.
>
> The app stores all data locally in %USERPROFILE%\JamiyKutupxana. It sends no
> data to any server operated by the publisher.
>
> Third-party content (Qur'an text from the Tanzil Project under CC BY 3.0,
> the Uyghur translation published by QuranEnc.com, UKIJ fonts under LGPL, and
> the KFGQPC Uthmanic Hafs font under its free-redistribution licence) is
> redistributed unmodified with full attribution. See THIRD-PARTY-NOTICES.md
> in the source repository.
>
> The app UI language is Uyghur (ug).

---

## 8. Before you click Submit — checklist

- [ ] `identityName`, `publisher`, `publisherDisplayName` copied from Partner Center into `package.json`
- [x] Support address `kelemdepter@gmail.com` set in `PRIVACY.md` — enter the same one in Partner Center
- [ ] `.appx` built with `npm run dist-store` and smoke-tested locally
- [ ] Privacy policy URL reachable in a browser
- [ ] Screenshots uploaded (≥ 1, 1366×768 or larger)
- [ ] "Contains live generative AI" ticked, and stated in both descriptions
- [ ] IARC questionnaire completed
- [ ] Notes for certification filled in
- [ ] Price set to Free, all markets selected

Certification usually takes 24–72 hours. If it fails, Partner Center names the
exact policy number — fix and resubmit; there is no penalty.
