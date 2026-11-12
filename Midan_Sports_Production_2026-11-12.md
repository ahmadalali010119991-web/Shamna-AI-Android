# ميدان الخبر — إصلاح تصنيف الرياضة وعزلها (12 نوفمبر 2026)

## النشر الإنتاجي
- Project: midan-al-khabar (`prj_UAmwtxYDBkMxYvpZTy8jArZAJhIw`)
- Alias: https://midan-al-khabar.vercel.app
- Final corrected production deployment: `dpl_EkKnhYggkCPmq4RD9r1afDeckNTp` (READY).
- Previous sports release before academic-Olympiad correction: `dpl_AzdRZhYbytPueJ56EnXXPbpkkVx2`.
- Baseline / rollback before all sports additions: `dpl_BdYrVDgouia842PiZhNVxWKK6WfY`.

## تغييرات المصدر
- `api/news.js`: Preserve previous quality gate and ordering, then separate sports using the new classifier.
- `lib/sports-news.js`: Classify sports by explicit category or grounded sports title signals; expressly exclude the academic/science Olympiad false positive.
- `sports-view.js`: Adds sports navigation in the Android WebView (desktop and mobile), fetches `/api/news?section=sports`, displays recent sport stories and original source links.
- `index.html`: Loads optional `/sports-view.js?v=20261112`.
- No changes to FCM, Telegram bridge, APK links, signing, or backend notifications in this release.
- Original deployed project had 107 source files. The sports release had 109; two new files, two modified files. The follow-on academic-Olympiad fix only changed `lib/sports-news.js`.

## فحوص مباشرة بعد النشر
- `GET /api/news` -> HTTP 200, 175 general articles.
- `GET /api/news?section=sports` -> HTTP 200, 1 sports article.
- `GET /sports-view.js` -> HTTP 200.
- Android WebView user-agent request for `/index.html` -> HTTP 200 and script reference found.
- Sport/general overlap: 0.
- Sports article: «منتخب سوريا للووشو كونغ فو يشارك في بطولة أوراسيا بتركيا».
- Article «22 طالباً من مركز المتميزين يتأهّلون إلى المرحلة الثانية من الأولمبياد العلمي السوري» remains in general feed, excluded from sports.
- GitHub Actions sports regression workflow: https://github.com/ahmadalali010119991-web/Shamna-AI-Android/actions/runs/43267927706 completed SUCCESS.

## الملفات المحفوظة
- `tools/midan-publisher/sports-news.cjs`
- `tools/midan-publisher/sports-news.test.cjs`
- `tools/midan-publisher/sports-view.js`
- `.github/workflows/midan-sports-regression.yml`

## حدود النطاق
- No real Android physical-device UI test has been performed. Existing service-worker caches may require an app restart to receive the updated HTML.
- The classification currently covers `/api/news`, not every separate optional citizen/third-party endpoint. Broader source integration and categorization across every pipeline remains to be verified.
- The Telegram delivery receipt audit, full expansion of northeast Syria and refugee sources, and site-wide source-attribution changes remain unfinished.
- Keep baseline deployment IDs for immediate rollback if a native regression occurs.
