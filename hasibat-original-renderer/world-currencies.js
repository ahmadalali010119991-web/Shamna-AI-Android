/* Hasibat Al-Lira — additive currency preferences and worldwide reference conversions.
 * Preserves the original five cards, primary SYP data, gold, fuel, updates,
 * notifications, libraries and offline calculation. No rate is fabricated.
 */
(function () {
  'use strict';
  const API = 'https://hasibat-al-lira-apk.vercel.app/api/currency-directory';
  const PREF_KEY = 'hasibat_visible_currencies_1819';
  const RATE_KEY = 'hasibat_world_rates_1819';
  const CORE = ['new', 'old', 'try', 'usd', 'eur'];
  const MAX_ACTIVE = 16;
  const codes = new Map();
  const rateMap = new Map();
  const baseCalculate = calculate;
  const nameFormatter = (typeof Intl.DisplayNames === 'function')
    ? new Intl.DisplayNames(['ar'], {type:'currency'}) : null;
  let enabled = new Set(CORE);
  let lastRates = null;
  let loading = false;
  let allItems = [];
  let showFilter = '';
  let listRoot, info, search, selectedCounter;
  const root = document.createElement('div');
  root.id = 'hasibat-currency-config';
  root.hidden = true;
  root.dir = 'rtl';
  const lock = (v) => String(v || '').toLowerCase();

  function parsePrefs() {
    let raw = null;
    try {
      if (window.ResultShareHost && typeof ResultShareHost.getCurrencySettings === 'function') {
        raw = ResultShareHost.getCurrencySettings();
      }
    } catch (_) {}
    if (!raw) try {raw = localStorage.getItem(PREF_KEY);} catch (_) {}
    if (!raw) return;
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p.active) && p.active.length >= 1 && p.active.length <= MAX_ACTIVE) {
        enabled = new Set(p.active.filter(x => typeof x === 'string' && /^[a-z]{2,5}$/.test(x)));
        if (!enabled.size) enabled = new Set(CORE);
      }
    } catch (_) {}
  }
  function savePrefs() {
    const data = JSON.stringify({version:1, active:Array.from(enabled)});
    try {localStorage.setItem(PREF_KEY, data);} catch (_) {}
    try {
      if (window.ResultShareHost && typeof ResultShareHost.saveCurrencySettings === 'function') {
        ResultShareHost.saveCurrencySettings(data);
      }
    } catch (_) {}
  }
  function loadedRates(r) {
    return r && r.ok === true && r.base === 'USD' && Array.isArray(r.rates) && r.rates.length >= 110;
  }
  function fromCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(RATE_KEY) || 'null');
      if (!raw || !loadedRates(raw.data) || !Number.isFinite(raw.savedAt)) return;
      // Reference quotes older than seven days must never appear as live quotes.
      if (Date.now() - raw.savedAt < 7 * 86400000) applyDirectory(raw.data, true);
    } catch (_) {}
  }
  function arabicName(item) {
    try {
      const value = nameFormatter && nameFormatter.of(item.code);
      if (value && value !== item.code) return value;
    } catch (_) {}
    return item.name || item.code;
  }
  function isExternal(key) {return !CORE.includes(key);}
  // Preserve the original calculation algorithm exactly for the original five currencies.
  calculate = function(value, from, to) {
    if (!isExternal(from) && !isExternal(to)) return baseCalculate(value, from, to);
    if (!Number.isFinite(value) || value < 0 || value > 1e15 || !model.rates || !validateRates(model.rates)) return null;
    let usd;
    if (isExternal(from)) {
      const source = rateMap.get(from);
      if (!source || !Number.isFinite(source.rate) || source.rate <= 0) return null;
      usd = value / source.rate;
    } else usd = baseCalculate(value, from, 'usd');
    if (usd === null || !Number.isFinite(usd)) return null;
    if (isExternal(to)) {
      const target = rateMap.get(to);
      return target && Number.isFinite(target.rate) && target.rate > 0 ? usd * target.rate : null;
    }
    return baseCalculate(usd, 'usd', to);
  };
  function createCard(item, key) {
    if (cards[key]) return;
    const card = document.createElement('article');
    card.className = 'card hasibat-extra-currency-card';
    card.id = 'card-' + key;
    const top = document.createElement('div'); top.className = 'cardTop';
    const name = document.createElement('div'); name.className = 'name'; name.textContent = arabicName(item);
    const tag = document.createElement('div'); tag.className = 'tag'; tag.textContent = item.code;
    top.append(name, tag);
    const value = document.createElement('div');value.id = 'value-' + key;value.className = 'value';value.textContent = '—';
    const sub = document.createElement('div');sub.className = 'subvalue';sub.textContent = 'سعر مرجعي — ' + item.date;
    card.append(top, value, sub);
    document.getElementById('results').appendChild(card);
    values[key] = value;cards[key] = card;
    if (!resultKeys.includes(key)) resultKeys.push(key);
  }
  function reconcileCards() {
    const previous = currencySelect.value;
    for (const key of CORE) cards[key].hidden = !enabled.has(key);
    // Existing original options are reused, not replaced permanently.
    currencySelect.textContent = '';
    const keys = [...CORE.filter(k => enabled.has(k))];
    for (const [key, item] of codes) {
      if (!cards[key]) createCard(item, key);
      cards[key].hidden = !enabled.has(key);
      if (enabled.has(key)) keys.push(key);
    }
    if (!keys.length) {enabled.add('usd'); keys.push('usd'); cards.usd.hidden = false;}
    keys.forEach(key => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = labels[key] || key.toUpperCase();
      currencySelect.appendChild(option);
    });
    currencySelect.value = keys.includes(previous) ? previous : keys.includes('usd') ? 'usd' : keys[0];
    render();
  }
  function applyDirectory(data, cached) {
    if (!loadedRates(data)) return false;
    lastRates = data;
    allItems = data.rates.filter(q => q && /^[A-Z]{3}$/.test(q.code) &&
      Number.isFinite(q.rate) && q.rate > 0 && !['USD','EUR','TRY','SYP'].includes(q.code))
      .map(q => ({...q, label:arabicName(q)}));
    allItems.sort((a,b) => a.label.localeCompare(b.label,'ar'));
    for (const q of allItems) {
      const key = lock(q.code);codes.set(key, q);rateMap.set(key, q);
      labels[key] = q.label;
    }
    // Persisted custom choices without a matching verified rate are removed from
    // the UI for this session, but retained in storage for restoration later.
    reconcileCards();
    if (info) info.textContent = (cached ? 'أسعار مرجعية محفوظة؛ تحقق من تاريخها. ' :
      'تم تحديث الأسعار المرجعية. ') + 'العملات المتاحة: ' + allItems.length +
      ' — المصدر: ' + data.provider;
    refreshList();
    return true;
  }
  async function fetchDirectory() {
    if (loading) return;
    loading = true;
    if (info) info.textContent = 'جارٍ تحديث قائمة العملات العالمية…';
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 13000);
      let response;
      try {response = await fetch(API, {cache:'no-store',signal:controller.signal});}
      finally {clearTimeout(timer);}
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (!applyDirectory(data, false)) throw new Error('invalid rate catalog');
      try {localStorage.setItem(RATE_KEY, JSON.stringify({savedAt:Date.now(),data}));} catch (_) {}
    } catch (_) {
      if (info) info.textContent = allItems.length ?
        'تعذر التحديث، تُعرض الأسعار المرجعية المحفوظة مع تواريخها.' :
        'تعذر تحميل العملات العالمية. العملات الأساسية تبقى متاحة؛ أعد المحاولة عند توفر الإنترنت.';
    } finally {loading = false;}
  }
  function refreshList() {
    if (!listRoot) return;
    const query = showFilter.trim().toLowerCase();
    const matching = [
      ...CORE.map(key => ({code:key.toUpperCase(),key,label:labels[key],basic:true})),
      ...allItems.map(item => ({...item,key:lock(item.code),basic:false}))
    ].filter(q => !query || (q.label + ' ' + q.code).toLowerCase().includes(query));
    listRoot.replaceChildren();
    for (const item of matching) {
      const line = document.createElement('label');line.className = 'hasibat-currency-option';
      const check = document.createElement('input');check.type = 'checkbox';check.checked = enabled.has(item.key);
      check.setAttribute('aria-label', 'إظهار ' + item.label);
      const name = document.createElement('span');name.textContent = item.label;
      const code = document.createElement('b');code.textContent = item.basic ? (item.key === 'new' ? 'SYP NEW' : item.key === 'old' ? 'SYP OLD' : item.code) : item.code;
      check.addEventListener('change', () => {
        if (check.checked && enabled.size >= MAX_ACTIVE) {
          check.checked = false;
          if (info) info.textContent = 'الحد الأقصى 16 عملة ظاهرة للحفاظ على سرعة ووضوح النتائج. يمكنك إخفاء عملة ثم إضافة أخرى.';
          return;
        }
        if (!check.checked && enabled.size === 1) {
          check.checked = true;
          if (info) info.textContent = 'يجب إبقاء عملة واحدة على الأقل.';
          return;
        }
        if (check.checked) enabled.add(item.key);else enabled.delete(item.key);
        savePrefs();reconcileCards();
        if (selectedCounter) selectedCounter.textContent = 'المعروضة: ' + enabled.size + ' / ' + MAX_ACTIVE;
      });
      line.append(check,name,code);listRoot.appendChild(line);
    }
    if (selectedCounter) selectedCounter.textContent = 'المعروضة: ' + enabled.size + ' / ' + MAX_ACTIVE;
  }
  function createSettings() {
    const head = document.querySelector('.panelHead');
    if (!head) return;
    const trigger = document.createElement('button');trigger.id='hasibatCurrencySettingsButton';trigger.type='button';
    trigger.className='hasibat-currency-trigger';trigger.textContent='⚙ إعدادات العملات';
    head.appendChild(trigger);
    root.innerHTML = '<section class="hasibat-currency-dialog" role="dialog" aria-modal="true" aria-labelledby="hasibatSettingsTitle">'+
      '<div class="hasibat-settings-top"><h2 id="hasibatSettingsTitle">إعدادات العملات</h2><button type="button" id="hasibatSettingsClose" aria-label="إغلاق الإعدادات">✕</button></div>'+
      '<p class="hasibat-settings-intro">اختر العملات التي تريد ظهورها في النتائج والقائمة، دون تغيير تصميم الحاسبة أو أسعار الليرة الأساسية.</p>'+
      '<label class="hasibat-settings-search-label">البحث باسم العملة أو رمزها<input id="hasibatCurrencySearch" type="search" placeholder="مثال: دينار، دولار، GBP، JOD"></label>'+
      '<div class="hasibat-settings-quote"><strong>عرض أسعار الصرف</strong><label><input type="checkbox" id="hasibatShowBidAsk"> إظهار أسعار الشراء والبيع الفعلية</label><small>الافتراضي: السعر الوسطي فقط. عند التفعيل تُعرض أسعار الشراء والبيع من المصدر دون تعديل الحسابات الأصلية.</small></div>'+
      '<p id="hasibatCurrenciesCounter"></p><div id="hasibatCurrenciesList" class="hasibat-currencies-list"></div>'+
      '<p id="hasibatCurrenciesInfo" class="hasibat-currencies-info" role="status"></p>'+
      '<div class="hasibat-settings-actions"><button type="button" id="hasibatSettingsReset">استعادة الافتراضي</button><button type="button" id="hasibatSettingsRefresh">تحديث العملات</button><button type="button" id="hasibatSettingsDone">تم</button></div>'+
      '<p class="hasibat-settings-note">العملات العالمية بأسعار وسطية مرجعية من بنوك مركزية. أسعار الليرة الأساسية من المصدر المعتمد داخل الحاسبة، ولا تُخلط بياناتها بالأسعار العالمية.</p></section>';
    document.body.appendChild(root);
    info = root.querySelector('#hasibatCurrenciesInfo');listRoot = root.querySelector('#hasibatCurrenciesList');
    search = root.querySelector('#hasibatCurrencySearch');selectedCounter = root.querySelector('#hasibatCurrenciesCounter');
    search.addEventListener('input', () => {showFilter=search.value;refreshList();});
    const quoteToggle=root.querySelector('#hasibatShowBidAsk');
    quoteToggle.checked=!!window.HasibatQuotes?.isEnabled?.();
    quoteToggle.addEventListener('change',()=>window.HasibatQuotes?.setEnabled?.(quoteToggle.checked));
    const close = () => {root.hidden=true;document.body.classList.remove('hasibat-currency-settings-open');};
    const open = () => {root.hidden=false;document.body.classList.add('hasibat-currency-settings-open');quoteToggle.checked=!!window.HasibatQuotes?.isEnabled?.();refreshList();search.focus();};
    trigger.addEventListener('click',open);
    root.querySelector('#hasibatSettingsClose').addEventListener('click',close);
    root.querySelector('#hasibatSettingsDone').addEventListener('click',close);
    root.addEventListener('click',e=>{if(e.target===root)close();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!root.hidden)close();});
    root.querySelector('#hasibatSettingsReset').addEventListener('click',()=>{enabled=new Set(CORE);savePrefs();reconcileCards();refreshList();});
    root.querySelector('#hasibatSettingsRefresh').addEventListener('click',fetchDirectory);
  }
  parsePrefs();
  // Original core currencies remain visible by default, even without Internet.
  createSettings();
  reconcileCards();
  fromCache();
  fetchDirectory();
  window.HasibatWorldCurrencies = Object.freeze({
    getVisibleKeys:() => resultKeys.filter(k => cards[k] && !cards[k].hidden),
    getCode:(k)=>CORE.includes(k)?({new:'SYP NEW',old:'SYP OLD',try:'TRY',usd:'USD',eur:'EUR'}[k]):k.toUpperCase(),
    getMaxVisible:()=>MAX_ACTIVE,
    getRateInfo:()=>lastRates?{provider:lastRates.provider,count:allItems.length,receivedAt:lastRates.receivedAt}:null,
    getEnabled:()=>Array.from(enabled)
  });
})();
