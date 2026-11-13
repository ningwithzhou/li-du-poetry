(() => {
  const $ = (selector) => document.querySelector(selector);
  const fmt = new Intl.NumberFormat('zh-CN');
  const state = { pairs: [], li: [], du: [], filter: 'all', query: '', shownPairs: 30, poet: 'li', poemQuery: '', shownPoems: 12 };
  const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const csvRows = (text) => {
    const rows = []; let row = [], value = '', quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quoted) { if (ch === '"' && text[i + 1] === '"') { value += '"'; i += 1; } else if (ch === '"') quoted = false; else value += ch; }
      else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(value); value = ''; }
      else if (ch === '\n') { row.push(value.replace(/\r$/, '')); if (row.some(Boolean)) rows.push(row); row = []; value = ''; }
      else value += ch;
    }
    if (value || row.length) { row.push(value.replace(/\r$/, '')); if (row.some(Boolean)) rows.push(row); }
    return rows;
  };
  async function loadCsv(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`无法读取 ${path}`);
    return csvRows((await response.text()).replace(/^\uFEFF/, ''));
  }
  function poemRows(rows) {
    return rows.map(([title, line, workId, order]) => ({ title, line, workId, order: Number(order) || 0 }));
  }
  function preparePairs(rows) {
    return rows.map((r, i) => ({
      liTitle: r[1], liLine: r[2], duTitle: r[4], duLine: r[5], score: Number(r[6]) / 10000,
      liId: r[7], liOrder: Number(r[8]) || 0, duId: r[9], duOrder: Number(r[10]) || 0, id: i,
    }));
  }
  function groupWorks(rows) {
    const groups = new Map();
    rows.forEach((row) => { if (!groups.has(row.workId)) groups.set(row.workId, { id: row.workId, title: row.title, lines: [] }); groups.get(row.workId).lines.push(row); });
    return [...groups.values()].map((work) => ({ ...work, lines: work.lines.sort((a, b) => a.order - b.order) }));
  }
  function stats() {
    const average = state.pairs.reduce((sum, pair) => sum + pair.score, 0) / state.pairs.length;
    $('#introPairCount').textContent = fmt.format(state.pairs.length);
    $('#metricPairs').textContent = fmt.format(state.pairs.length);
    $('#metricLiLines').textContent = fmt.format(state.li.length);
    $('#metricDuLines').textContent = fmt.format(state.du.length);
    $('#metricLiWorks').textContent = fmt.format(groupWorks(state.li).length);
    $('#metricDuWorks').textContent = fmt.format(groupWorks(state.du).length);
    $('#metricAverage').textContent = average.toFixed(3);
  }
  function chartBins() {
    const bins = Array.from({ length: 6 }, (_, i) => ({ start: .7 + i * .05, end: .75 + i * .05, count: 0 }));
    state.pairs.forEach(({ score }) => { const ix = Math.max(0, Math.min(5, Math.floor((score - .7) / .05))); bins[ix].count += 1; });
    return bins;
  }
  const canvas = $('#distributionChart');
  const tooltip = $('#chartTooltip');
  let hitRects = [];
  function drawChart() {
    const rect = canvas.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height, pad = { l: 35, r: 9, t: 8, b: 30 }, plotW = w - pad.l - pad.r, plotH = h - pad.t - pad.b;
    const bins = chartBins(), max = Math.max(...bins.map((b) => b.count), 1), step = plotW / bins.length, barW = Math.min(42, step * .54);
    ctx.clearRect(0, 0, w, h); ctx.font = '10px "DM Mono", monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#e5e2da'; ctx.fillStyle = '#99988f'; hitRects = [];
    for (let i = 0; i <= 3; i += 1) { const y = pad.t + plotH - (plotH * i / 3); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke(); ctx.fillText(fmt.format(Math.round(max * i / 3)), pad.l - 7, y); }
    bins.forEach((bin, i) => {
      const x = pad.l + step * i + (step - barW) / 2; const bh = (bin.count / max) * (plotH - 4); const y = pad.t + plotH - bh;
      ctx.fillStyle = i === bins.length - 1 ? '#b94a36' : '#ce8d7c'; ctx.fillRect(x, y, barW, bh);
      ctx.fillStyle = '#77786f'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(bin.start.toFixed(2), x + barW / 2, pad.t + plotH + 9);
      hitRects.push({ x, y: pad.t, width: barW, height: plotH, bin });
    });
  }
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
    const hit = hitRects.find((r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height);
    if (!hit) { tooltip.hidden = true; return; }
    tooltip.hidden = false; tooltip.textContent = `${hit.bin.start.toFixed(2)}–${hit.bin.end.toFixed(2)} · ${fmt.format(hit.bin.count)} 组`;
    tooltip.style.left = `${hit.x + hit.width / 2}px`; tooltip.style.top = `${Math.max(10, y)}px`;
  });
  canvas.addEventListener('mouseleave', () => { tooltip.hidden = true; });

  function pairMarkup(pair) {
    return `<article class="pair-row"><div class="pair-poem"><span class="poem-title">${esc(pair.liTitle)}</span><div class="poem-line li">${esc(pair.liLine)}</div></div><div class="pair-link" aria-hidden="true">↔</div><div class="pair-poem"><span class="poem-title">${esc(pair.duTitle)}</span><div class="poem-line du">${esc(pair.duLine)}</div></div><div class="score-cell"><span class="score-number">${pair.score.toFixed(4)}</span><span class="score-track"><i style="width:${Math.round(pair.score * 100)}%"></i></span></div></article>`;
  }
  function visiblePairs() {
    const threshold = state.filter === 'all' ? .7 : Number(state.filter) / 100;
    const query = state.query.trim().toLocaleLowerCase();
    return state.pairs.filter((p) => p.score >= threshold && (!query || `${p.liTitle} ${p.liLine} ${p.duTitle} ${p.duLine}`.toLocaleLowerCase().includes(query)));
  }
  function renderPairs() {
    const matched = visiblePairs(); const sorted = [...matched].sort(state.sort === 'source' ? (a, b) => a.liTitle.localeCompare(b.liTitle, 'zh') || a.liOrder - b.liOrder : (a, b) => b.score - a.score || a.id - b.id);
    const shown = sorted.slice(0, state.shownPairs);
    $('#pairList').innerHTML = shown.length ? shown.map(pairMarkup).join('') : '<div class="empty-state">没有找到匹配的诗句配对</div>';
    $('#pairResultCount').textContent = `${fmt.format(matched.length)} 组`;
    $('#listStatus').textContent = `显示 ${fmt.format(shown.length)} / ${fmt.format(matched.length)} 组`;
    $('#loadMore').disabled = shown.length >= matched.length;
    $('#loadMore').hidden = shown.length >= matched.length || shown.length === 0;
  }
  function renderHighlights() {
    const top = [...state.pairs].sort((a, b) => b.score - a.score || a.id - b.id).slice(0, 4);
    $('#highlightList').innerHTML = top.map((p) => `<div class="highlight-item" data-pair-id="${p.id}"><div class="highlight-lines"><span>${esc(p.liLine)}</span><span>${esc(p.duLine)}</span></div><span class="highlight-score">${p.score.toFixed(4)}</span></div>`).join('');
  }
  function selectedWorks() {
    const rows = state.poet === 'li' ? state.li : state.du; const q = state.poemQuery.trim().toLocaleLowerCase();
    return groupWorks(rows).filter((work) => !q || `${work.title} ${work.lines.map((line) => line.line).join(' ')}`.toLocaleLowerCase().includes(q));
  }
  function renderPoems() {
    const works = selectedWorks(), shown = works.slice(0, state.shownPoems);
    $('#poemGrid').innerHTML = shown.length ? shown.map((work) => {
      const lines = work.lines.slice(0, 4).map((line) => `<div class="verse"><span class="verse-num">${String(line.order + 1).padStart(2, '0')}</span>${esc(line.line)}</div>`).join('');
      return `<article class="poem-card"><div class="poem-card-head"><h3 title="${esc(work.title)}">${esc(work.title)}</h3><span class="poem-card-count">${work.lines.length} 句</span></div><div class="verse-list">${lines}</div></article>`;
    }).join('') : '<div class="empty-state">没有找到匹配的作品</div>';
    $('#poemResultCount').textContent = `${fmt.format(works.length)} 首`;
    $('#poemListStatus').textContent = `显示 ${fmt.format(shown.length)} / ${fmt.format(works.length)} 首作品 · 每首展示前 4 句`;
    $('#poemLoadMore').disabled = shown.length >= works.length;
    $('#poemLoadMore').hidden = shown.length >= works.length || shown.length === 0;
  }
  function setActiveNav() {
    const links = [...document.querySelectorAll('.nav-link')];
    const observer = new IntersectionObserver((entries) => { const visible = entries.filter((e) => e.isIntersecting).sort((a,b) => b.intersectionRatio-a.intersectionRatio)[0]; if (!visible) return; links.forEach((a) => a.classList.toggle('active', a.hash === `#${visible.target.id}`)); }, { rootMargin: '-25% 0px -65% 0px' });
    ['overview','pairs','poems'].forEach((id) => observer.observe(document.getElementById(id)));
  }
  function toast(text) { const node = $('#toast'); node.textContent = text; node.classList.add('visible'); window.setTimeout(() => node.classList.remove('visible'), 1800); }
  function bind() {
    document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => { state.filter = button.dataset.filter; state.shownPairs = 30; document.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('selected', b === button)); renderPairs(); }));
    $('#pairSearch').addEventListener('input', (e) => { state.query = e.target.value; state.shownPairs = 30; renderPairs(); });
    $('#pairSort').addEventListener('change', (e) => { state.sort = e.target.value; renderPairs(); });
    $('#loadMore').addEventListener('click', () => { state.shownPairs += 30; renderPairs(); });
    $('#showPairsButton').addEventListener('click', () => { document.querySelector('#pairs').scrollIntoView({ behavior: 'smooth' }); $('#pairSearch').focus({ preventScroll: true }); });
    $('#poemSearch').addEventListener('input', (e) => { state.poemQuery = e.target.value; state.shownPoems = 12; renderPoems(); });
    $('#poemLoadMore').addEventListener('click', () => { state.shownPoems += 12; renderPoems(); });
    document.querySelectorAll('[data-poet]').forEach((button) => button.addEventListener('click', () => { state.poet = button.dataset.poet; state.shownPoems = 12; document.querySelectorAll('[data-poet]').forEach((b) => b.classList.toggle('selected', b === button)); renderPoems(); }));
    $('#pairList').addEventListener('click', async (event) => { const line = event.target.closest('.poem-line'); if (!line) return; try { await navigator.clipboard.writeText(line.textContent); toast('诗句已复制'); } catch { toast(line.textContent); } });
    $('#highlightList').addEventListener('click', (event) => { const item = event.target.closest('.highlight-item'); if (!item) return; const pair = state.pairs.find((p) => p.id === Number(item.dataset.pairId)); state.query = pair.liLine; $('#pairSearch').value = state.query; state.shownPairs = 30; renderPairs(); $('#pairs').scrollIntoView({ behavior: 'smooth' }); });
    document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#pairSearch').focus(); } });
    window.addEventListener('resize', drawChart);
    setActiveNav();
  }
  async function init() {
    try {
      const [pairs, li, du] = await Promise.all([loadCsv('./data/李白-杜甫.csv'), loadCsv('./data/李白.csv'), loadCsv('./data/杜甫.csv')]);
      state.pairs = preparePairs(pairs); state.li = poemRows(li); state.du = poemRows(du);
      stats(); renderHighlights(); drawChart(); renderPairs(); renderPoems(); bind();
    } catch (error) {
      document.querySelector('main').innerHTML = `<div class="empty-state">数据加载失败：${esc(error.message)}<br>请通过本地网页服务器打开此页面。</div>`;
    }
  }
  init();
})();
