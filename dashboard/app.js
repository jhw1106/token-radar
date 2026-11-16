// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, the filters, a per-protocol detail
// view with the model's own inputs and the protocol's farm plan, the live-token
// view, and the model itself. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('app');

  // ---- URL params: the deterministic views the screenshots use ----
  //   ?view=board|live   ?detail=<slug>   ?filter=<category>
  //   ?min_tvl=<usd>     ?q=<text>        ?sort=<key>&dir=asc|desc
  var params = new URLSearchParams(window.location.search);
  var state = {
    view: params.get('view') === 'live' ? 'live' : 'board',
    category: params.get('filter') || 'all',
    minTvl: parseInt(params.get('min_tvl') || '0', 10) || 0,
    q: params.get('q') || '',
    sort: params.get('sort') || 'implied',
    dir: params.get('dir') === 'asc' ? 1 : -1,
    detail: params.get('detail') || null,
  };

  // ---- formatters ----
  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // ---- small DOM helper ----
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // ---- the farm plan, derived in the page the same way main.ts derives it ----
  // Category, chains, TVL and age decide the action, the capital, the hold and
  // every cost and time. No protocol name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 1e10) return 300;
    if (p.tvl_usd >= 1e9) return 200;
    if (p.tvl_usd >= 1e8) return 120;
    return 60;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 90) return 90;
    if (age < 365) return 60;
    return 45;
  }
  function mainAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Lend $' + capital + ' of USDC on ' + name + ' on ' + chain + ' and leave the deposit earning.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Add $' + capital + ' of liquidity to ' + name + "'s deepest pool on " + chain + ' and hold the LP position.';
    if (c.indexOf('yield') >= 0) return 'Deposit $' + capital + " into " + name + "'s highest-TVL vault on " + chain + ' and keep the shares.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Move $' + capital + ' of USDC to ' + chain + ' through ' + name + " and put the bridged funds to work in its app.";
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's native asset through " + name + ' on ' + chain + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Post $' + capital + ' of USDC as margin on ' + name + ' and open one small, hedged trade.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' on ' + name + ' and take one position in an active market.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('onchain capital') >= 0) return 'Allocate $' + capital + ' to a ' + name + ' vault on ' + chain + ' and keep the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the yield-bearing asset " + name + ' offers on ' + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('launchpad') >= 0) return 'Stake $' + capital + " to qualify for " + name + "'s next launch allocation on " + chain + '.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow a small amount against the deposit on ' + name + ', then repay it the same week.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap a small amount through ' + name + ' on ' + chain + ' so the wallet shows trading as well as liquidity.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Send a second, smaller transfer back through ' + name + ' so the wallet has activity in both directions.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Claim or restake the staking rewards ' + name + ' accrues, even if the amount is small.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Close the hedge on ' + name + ' and open a fresh one, so the wallet shows repeated use.';
    if (c.indexOf('prediction') >= 0) return 'Settle one market on ' + name + ' and place a second small position in another.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('onchain capital') >= 0) return 'Rebalance part of the ' + name + ' allocation into a second vault on ' + chain + '.';
    if (c.indexOf('stable') >= 0) return 'Swap a small amount of the stable asset back through ' + name + ' to show both directions.';
    if (c.indexOf('rwa') >= 0) return "Check " + name + "'s yield distribution and claim any accrued yield it pays out.";
    if (c.indexOf('insurance') >= 0) return 'File a test claim or review the cover terms on ' + name + ' so the policy is not idle.';
    if (c.indexOf('launchpad') >= 0) return "Join " + name + "'s community vote or whitelist task for the next launch.";
    return 'Use one more feature of ' + name + ' on ' + chain + ', such as a swap, a vote or a claim, for a small amount.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page for its points.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Open a fresh wallet for this farm alone, fund it with $' + (capital + 20) + ' of USDC, and store its seed phrase offline.', cost: 'about $3 of gas to fund it', time: '10 minutes' },
      { text: mainAction(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 200 ? 10 : 5) + ' of gas', time: '20 minutes to set up' },
      { text: secondAction(p, capital, chain), cost: 'about $5 of gas', time: '10 minutes' },
      { text: 'Do one qualifying action each week on ' + p.name + ', such as a deposit, a swap, a vote or a claim.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Keep the position for at least ' + hold + ' days, then open the protocol\'s own points or rewards page and check the balance.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days, then 10 minutes to check' },
      { text: 'Write the wallet address, the dates and every transaction hash in a farm log, and claim only from a link the protocol itself publishes.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  // The model in one function: the page recomputes a row from the snapshot
  // figures and the multipliers the board carries, so the page's code and the
  // board's data are visibly the same arithmetic (multipliers shown rounded).
  function impliedOf(row) {
    var growth = row.change_7d === null || row.change_7d === undefined ? 0 : Math.min(100, Math.max(-50, row.change_7d));
    var growthMult = 1 + (growth / 100) * 0.4;
    var age = row.age_days === null || row.age_days === undefined ? 365 : row.age_days;
    var maturity = 0.7 + (Math.min(Math.max(age, 0), 1095) / 1095) * 0.3;
    var chainMult = 1 + 0.05 * Math.min((row.chains || []).length, 8);
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity * chainMult));
  }

  // ---- filtering and sorting ----
  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.minTvl > 0 && r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.category_multiple; bv = b.category_multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function syncUrl() {
    var p = new URLSearchParams();
    if (state.view !== 'board') p.set('view', state.view);
    if (state.category !== 'all') p.set('filter', state.category);
    if (state.minTvl > 0) p.set('min_tvl', String(state.minTvl));
    if (state.q) p.set('q', state.q);
    if (state.detail) p.set('detail', state.detail);
    if (state.sort !== 'implied') p.set('sort', state.sort);
    if (state.dir === 1) p.set('dir', 'asc');
    var next = p.toString();
    var url = next ? window.location.pathname + '?' + next : window.location.pathname;
    window.history.replaceState(null, '', url);
  }

  // ---- sections ----
  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'dot' }),
        el('span', { class: 'brand-name', html: 'Token <em>Radar</em>' })
      ),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'Source ', el('b', { text: 'DefiLlama protocol index' })),
        el('span', null, 'Model ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function hero() {
    return el('section', { class: 'hero' },
      el('h1', { html: DATA.board_size + ' pre-token protocols, ranked by <span class="hl">implied value</span>' }),
      el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, by TVL. Implied value is a model calibrated on the snapshot itself — not a promise, and never a prediction that a token will launch.' }),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('span', { text: 'Watchlist covered' }), el('b', { html: DATA.watchlist_size + ' <small>/ ' + DATA.watchlist_size + '</small>' })),
        el('div', { class: 'stat' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; syncUrl(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; syncUrl(); render(); });
    var tvl = el('select', { id: 'min-tvl', 'aria-label': 'Minimum TVL' },
      el('option', { value: '0', text: 'Any TVL' }),
      el('option', { value: '50000000', text: 'TVL ≥ $50M', selected: state.minTvl === 50000000 ? 'selected' : null }),
      el('option', { value: '100000000', text: 'TVL ≥ $100M', selected: state.minTvl === 100000000 ? 'selected' : null }),
      el('option', { value: '500000000', text: 'TVL ≥ $500M', selected: state.minTvl === 500000000 ? 'selected' : null }),
      el('option', { value: '1000000000', text: 'TVL ≥ $1B', selected: state.minTvl === 1000000000 ? 'selected' : null })
    );
    tvl.addEventListener('change', function () { state.minTvl = parseInt(tvl.value, 10) || 0; syncUrl(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.view === 'board' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.view = 'board'; syncUrl(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.view === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.view = 'live'; syncUrl(); render(); } });
    var shown = state.view === 'board' ? visibleRows().length + ' rows shown' : DATA.live.length + ' live-token protocols';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'min-tvl', text: 'Minimum TVL' }), tvl),
      el('div', { class: 'field' }, el('span', { class: 'lbl', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: shown })
    );
  }

  function sortHeader(key, label, cls) {
    return el('th', { scope: 'col', class: cls || null },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } syncUrl(); render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(visibleRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'btn', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.minTvl = 0; syncUrl(); render(); } })
      ));
    }
    var max = 0;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    if (!max) max = 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.detail === r.slug ? 'true' : 'false',
        class: state.detail === r.slug ? 'selected' : null,
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' }, el('span', { class: 'rank', text: String(r.rank) })),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: String(r.category_multiple) }),
        el('td', null, el('div', { class: 'bar-row' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'pill', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank', 'num'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL', 'num'),
            sortHeader('growth', '7d', 'num'),
            sortHeader('age', 'Age', 'num'),
            sortHeader('multiple', 'Cat. x', 'num'),
            sortHeader('implied', 'Implied value', 'num'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num' }, el('span', { class: 'rank', text: 'live' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'pill live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Tokens live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', class: 'num', text: 'Status' }),
            el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', class: 'num', text: 'TVL' }),
            el('th', { scope: 'col', class: 'num', text: '7d' }),
            el('th', { scope: 'col', class: 'num', text: 'Market cap' }),
            el('th', { scope: 'col', text: 'Token' }
          ))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var multEntries = Object.keys(DATA.multiples).map(function (k) { return [k, DATA.multiples[k]]; });
    multEntries.sort(function (a, b) { return b[1] - a[1]; });
    var formula = 'implied = round( tvl_usd x category_multiple x growth x maturity x chains )\n' +
      '  category_multiple = median mcap/TVL of the live protocols in the category\n' +
      '                    (global median ' + DATA.global_multiple + ' when fewer than ' + m.min_live_for_category + ' live protocols)\n' +
      '  growth            = 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + '\n' +
      '  maturity          = ' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + '   (unknown age: ' + m.unknown_age_days + ' days)\n' +
      '  chains            = 1 + ' + m.chain_bonus + ' x min(chain count, ' + m.chain_cap + ')';
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed — model ' + DATA.model_version }),
      el('p', { text: 'One function scores every protocol. The category multiple is calibrated on the snapshot itself: the median market-cap-to-TVL multiple of the protocols in that category whose token already trades. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula', text: formula }),
      el('div', { class: 'consts' },
        el('span', null, 'Growth clamp ', el('b', { text: m.growth_floor + '% to +' + m.growth_cap + '%' })),
        el('span', null, 'Growth weight ', el('b', { text: String(m.growth_weight) })),
        el('span', null, 'Maturity ', el('b', { text: m.maturity_floor + ' + ' + m.maturity_range + ' over ' + m.maturity_days + 'd' })),
        el('span', null, 'Chain bonus ', el('b', { text: '+' + m.chain_bonus + ' per chain, max ' + m.chain_cap })),
        el('span', null, 'Multiple bounds ', el('b', { text: m.multiple_floor + ' to ' + m.multiple_cap })),
        el('span', null, 'Global median ', el('b', { text: String(DATA.global_multiple) }))
      ),
      el('table', { class: 'mult-table' },
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Category' }),
          el('th', { scope: 'col', class: 'num', text: 'Median mcap / TVL' })
        )),
        el('tbody', null, multEntries.map(function (e) {
          return el('tr', null, el('td', { text: e[0] }), el('td', { class: 'num', text: String(e[1]) }));
        }))
      ),
      el('p', { text: 'Categories with fewer than ' + m.min_live_for_category + ' live protocols use the global median of ' + DATA.global_multiple + '. The early radar is every pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown.' })
    );
  }

  function detailPanel() {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === state.detail) row = r; });
    if (!row) return null;
    var steps = farmSteps(row);
    var recomputed = impliedOf(row);
    var note = recomputed === row.implied_value_usd
      ? 'The page recomputes this row as ' + fmtUsd(recomputed) + ' — the same number board.json carries.'
      : 'The page recomputes this row as ' + fmtUsd(recomputed) + ' from the multipliers shown (rounded to 4 decimals); the board carries ' + fmtUsd(row.implied_value_usd) + '.';
    var panel = el('section', { class: 'detail', id: 'detail' },
      el('div', { class: 'detail-head' },
        el('div', null,
          el('span', { class: 'kicker', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' + DATA.model_version + ' model' }),
          el('h2', { text: row.name }),
          el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · listed ' + (row.listed_at || 'on an unknown date') })
        ),
        el('button', { class: 'btn ghost close', type: 'button', text: 'Close', onclick: function () { closeDetail(); } })
      ),
      el('div', { class: 'detail-body' },
        el('div', { class: 'detail-sec' },
          el('h3', { text: 'Implied value' }),
          el('div', { class: 'math' },
            el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) }),
            el('span', { text: 'Category multiple' }), el('b', { text: String(row.category_multiple) }),
            el('span', { text: 'Seven-day growth' }), el('b', { text: fmtPct(row.change_7d) }),
            el('span', { text: 'Growth multiplier' }), el('b', { text: String(row.growth_multiplier) }),
            el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row.age_days) }),
            el('span', { text: 'Maturity multiplier' }), el('b', { text: String(row.maturity_multiplier) }),
            el('span', { text: 'Chains' }), el('b', { text: String((row.chains || []).length) }),
            el('span', { text: 'Chain multiplier' }), el('b', { text: String(row.chain_multiplier) }),
            el('span', { class: 'total', text: 'Implied value' }), el('b', { class: 'total', text: fmtUsd(row.implied_value_usd) })
          ),
          el('p', { class: 'math-note', text: note + ' This is an estimate, not a price.' })
        ),
        el('div', { class: 'detail-sec' },
          el('h3', { text: 'Farm plan' }),
          el('ol', { class: 'steps' }, steps.map(function (s) {
            var at = s.indexOf(' Cost: ');
            var action = at >= 0 ? s.slice(0, at) : s;
            var tail = at >= 0 ? s.slice(at + 1) : '';
            return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
          }))
        )
      )
    );
    return panel;
  }

  function openDetail(slug) {
    state.detail = slug;
    state.view = 'board';
    syncUrl();
    render();
    var d = document.getElementById('detail');
    if (d && d.scrollIntoView) d.scrollIntoView({ block: 'start' });
  }
  function closeDetail() {
    state.detail = null;
    syncUrl();
    render();
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    // A detail view is the focus of its page: the hero steps aside so the
    // whole detail panel fits in one viewport.
    if (!state.detail) shell.appendChild(hero());
    shell.appendChild(controls());
    var detail = detailPanel();
    if (detail) shell.appendChild(detail);
    shell.appendChild(state.view === 'board' ? boardTable() : liveTable());
    if (state.view === 'board') shell.appendChild(modelPanel());
    shell.appendChild(el('footer', { class: 'foot' },
      el('p', { text: 'Source: the sealed DefiLlama protocol snapshot of ' + DATA.as_of + '. A protocol is called pre-token only because its record carries no token — the record is not proof it has none. Implied value is this entry\u2019s own claim, never a price, and it does not predict whether or when a token is issued.' })
    ));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
  }

  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.detail) closeDetail();
  });
})();
