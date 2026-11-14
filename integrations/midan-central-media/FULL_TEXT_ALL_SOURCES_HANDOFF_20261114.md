# Midan Al Khabar: complete text and unified news buttons — handoff 2026-11-14

## Owner intent (Arabic)
All news from **every** source must preserve ALL text available from the source; do not truncate to a title, 300-character summary, 500-character excerpt or 1,024-character Telegram caption. All published news should include clickable buttons: "📲 افتح الخبر في ميدان الخبر" with the exact **in-site news/voice URL**, "📷 إنستغرام" and "🎵 تيك توك". Continue to preserve photo albums, video, dedupe, original source attribution for public publishers, and fixed caption "المصدر: خاص بميدان الخبر" without exposing the private channel for sourceId `private-source99`.

## Scope and production safety
Team `team_LM2rmLvMuTiCMcSoLgBt2phk`.
Vercel bridge project `prj_oWnZko96P0cvw1FkxAg6ObAXHZAA`, `https://dallalna-telegram-bridge.vercel.app`; stable production as of handoff `dpl_hN1G1r8vZKZrxSQf2FaQRcQpGn38`.
Site project `prj_UAmwtxYDBkMxYvpZTy8jArZAJhIw`, `https://midan-al-khabar.vercel.app`; stable production `dpl_7TEHzNoBSE4NFBHfZQgZSfXU5xmB`.
**Do not change** `api/health.js` in production; all diagnostics deployed by overriding health were preview-only.
Never replace all app files from GitHub: existing production deployments have 111 bridge files and 126 site files and many patches. Use `list_deployment_files` from a verified preview deployment and replace only changed files or promote the tested preview.

## Verified preview builds
1. `dpl_6iX7Vi1d9qT76EK5pK3C2dKh7cMj` (bridge): COMPLETE generic news content, chunked translation, follow-up replies for >3200 visible chars, follow-up for news photos with >300-char summary (caption truncation), exact article/voice buttons, source99 publisher with long-text continuation and social buttons. It contains all 111 bridge files. **One outstanding defect**: `lib/telegram-routing.js` `normalizedMarkup()` strips both social buttons, preserving only the news/app button. See required fix below.
2. `dpl_4iZXwhCgaiaCaQGqdjPodkbj16mG` (site): share page `open.html` supports `?voice=<id>` using `/api/citizen?voices=public`, as well as existing `?article=<id>`. It contains 126 site files. Deploy only after verifying.
3. `dpl_FhLqkHCHHQmNJJWNdNx532QfHAYH` (bridge test preview): `/api/health` returns `completeNews=true,newsLength=3972,fullVoice=true,directStory=true,privateLabel=true,privateButton=true,privateInstagram=true,privateTikTok=true,photoContinuation=true`, BUT `socialInstagram=false,socialTikTok=false` due to generic routing defect. This is a simulation and MUST NOT be deployed to production as its health route is diagnostic.

## Required patch in preview bridge routing file
In `lib/telegram-routing.js` in preview deployment `dpl_6iX7Vi1d9qT76EK5pK3C2dKh7cMj`, inside `normalizedMarkup()`, find:
```javascript
keep.push([target==='rates'?RATES_BUTTON:{...NEWS_BUTTON,url:direct?.url||newsUrl}]);
```
Insert the next line immediately afterwards:
```javascript
keep.push(SOCIAL_BUTTONS);
```
This is needed because that function removes existing social buttons before rebuilding the inline keyboard. Test all three resulting buttons and exact story URLs. Do NOT append duplicate social buttons.

## Production limit blocker
Vercel Hobby currently rejects `create_deployment` with HTTP 402 `api-deployments-free-per-day` (more than 100 API deployments, rolling 24 hours). The final patch was syntax checked with `new Function` in the tool session but the API refused the request; thus it is **not deployed**, and public production remains unchanged.
Wait for quota to free up (do not upgrade plan or pay). Then create a new bridge preview using file refs from `dpl_6iX7Vi1d9qT76EK5pK3C2dKh7cMj`, but replace ONLY `lib/telegram-routing.js` with patched source. For reading full source, previously used a preview diagnostic health endpoint; note `get_deployment_file_contents` truncates large files at ~1,500 bytes, so use allowed Vercel tools or repository-backed code, never guess reconstructed source. Run simulated tests for news, voice, source99 text/media album. Promote production only if checks pass and health remains unchanged. Then deploy the site preview, and validate live health `/api/health`, status `/api/status-v2`, site `/api/news`, gallery post 8 has two photos, `open.html?article=private-source99-8`, and a live new item without duplicates.

## Caveats
Full preservation means **all data received from source feed**. If original news source itself only supplies an excerpt, website scraping or source metadata improvements are a separate task; never invent missing text and never falsely claim verbatim full-text preservation from external sites without reading them.
When sending Telegram caption with photos, original image may be posted with a shorter caption; reply with full body **linked to the original message**, not a new standalone news post. If a follow-up fails after the original succeeds, log without re-sending the media; do not recreate a duplicate publication. Check Telegram's per-message 4,096-character limit (and 1,024 for media captions).
