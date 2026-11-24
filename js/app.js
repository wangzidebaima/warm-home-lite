(function () {
  'use strict';
  var DATA_URL = '../warm-home/data/content.json';
  var ASSET = '../warm-home/';
  var RAF = window.requestAnimationFrame || window.webkitRequestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
  var CAF = window.cancelAnimationFrame || window.webkitCancelAnimationFrame || function (id) { clearTimeout(id); };
  var content = null;
  var photoTimer = null;
  var photoIdx = 0;
  var scrollers = [];

  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // ---------- 加载内容 ----------
  function loadContent(cb) {
    fetch(DATA_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) { content = d; renderAll(); if (cb) cb(); })
      .catch(function () {
        // 首次可能拿到缓存，仍尝试渲染
        if (!content && cb) cb();
      });
  }

  function renderAll() {
    if (!content) return;
    $('title').textContent = content.title || '温馨的小家';
    $('subtitle').textContent = content.subtitle || '';
    document.title = content.title || '温馨的小家';

    renderDate();
    renderCountdown();
    renderTheme();
    renderList('todos', (content.todos || []).map(function (t) {
      return typeof t === 'string' ? { text: t } : { text: t.text };
    }), 'todo');
    renderList('messages', (content.messages || []).map(function (m) {
      return { who: m.from, text: m.text };
    }), 'msg');
    renderHomework();

    initPhotos();
    renderWeatherIcon(0);
    loadWeather();
  }

  // ---------- 作业：只显示当天布置的 ----------
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function renderHwCol(id, col) {
    var cls = id === 'sonHomework' ? 'hw-son' : 'hw-daughter';
    var fresh = col && col.date === todayKey() && col.items && col.items.length;
    if (fresh) {
      renderList(id, col.items.map(function (t) { return { text: t }; }), cls);
    } else {
      renderList(id, [{ text: '今日没有布置作业', empty: true }], cls);
    }
  }

  function renderHomework() {
    var hw = content ? (content.homework || {}) : {};
    $('sonName').textContent = (hw.son && hw.son.name) || '儿子';
    $('daughterName').textContent = (hw.daughter && hw.daughter.name) || '女儿';
    renderHwCol('sonHomework', hw.son);
    renderHwCol('daughterHomework', hw.daughter);
  }

  // ---------- 时钟 ----------
  function renderClock() {
    var el = $('clockTime');
    if (!el) return;
    var now = new Date();
    el.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes());
  }

  // ---------- 日期 / 农历 ----------
  function renderDate() {
    var now = new Date();
    var weeks = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
    var main = (now.getMonth() + 1) + '月' + now.getDate() + '日 ' + weeks[now.getDay()];
    $('dateMain').textContent = main;
    var l = window.Lunar ? window.Lunar.solarToLunar(now.getFullYear(), now.getMonth() + 1, now.getDate()) : null;
    $('dateLunar').textContent = l ? ('农历' + l.text + ' · ' + l.ganzhi + l.animal + '年') : '';
  }

  // ---------- 倒计时 ----------
  function renderCountdown() {
    if (!content.examDate) { $('countdownBox').style.display = 'none'; return; }
    $('examLabel').textContent = '距' + (content.examLabel || '考试');
    var target = new Date(content.examDate + 'T00:00:00');
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var days = Math.round((target - today) / 86400000);
    $('countdownNum').textContent = days >= 0 ? days : 0;
  }

  // ---------- 每日主题 + 特殊日子 ----------
  function renderTheme() {
    var topics = content.loveTopics || [];
    if (topics.length) {
      var now = new Date();
      // 用连续天数取模：跨月不会跳号，保证每天严格换一条、每条都轮得到
      var dayIndex = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
      $('themeText').textContent = topics[dayIndex % topics.length];
    }
    var todayStr = pad(new Date().getMonth() + 1) + '-' + pad(new Date().getDate());
    var lunarKey = window.Lunar ? window.Lunar.lunarKey(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()) : '';
    var hits = [];
    (content.specialDays || []).forEach(function (s) {
      if (s.type === 'lunar' && s.lunar === lunarKey) hits.push(s.name);
      else if (s.type !== 'lunar' && s.date === todayStr) hits.push(s.name);
    });
    (content.birthdays || []).forEach(function (b) {
      if (b.date && b.date.slice(5) === todayStr) hits.push('🎂 ' + b.name + '生日');
    });
    $('specialDay').textContent = hits.length ? ('★ 今天是' + hits.join('、')) : '';
  }

  // ---------- 列表渲染 + 自动滚动 ----------
  function renderList(id, items, cls) {
    var track = $(id);
    if (!track) return;
    // 内容可能被换成更少的条目：先停掉旧滚动动画，否则残留位移会让列表错位
    if (track._raf) { CAF(track._raf); track._raf = null; }
    track.style.webkitTransform = 'translateY(0)';
    track.style.transform = 'translateY(0)';
    track.innerHTML = '';
    if (!items.length) {
      var empty = document.createElement('div');
      empty.className = 'item';
      empty.textContent = '暂无内容';
      empty.style.opacity = '.55';
      track.appendChild(empty);
      return;
    }
    items.forEach(function (it) {
      var div = document.createElement('div');
      div.className = 'item';
      if (it.empty) { div.style.opacity = '.6'; div.style.textAlign = 'center'; }
      if (it.who) {
        var w = document.createElement('span');
        w.className = 'who';
        w.textContent = it.who + '：';
        div.appendChild(w);
      }
      div.appendChild(document.createTextNode(it.text || ''));
      track.appendChild(div);
    });
    setupScroll(track);
  }

  function setupScroll(track) {
    var win = track.parentElement;
    // 重置动画
    track.style.transition = 'none';
    track.style.webkitTransform = 'translateY(0)';
    track.style.transform = 'translateY(0)';
    // 克隆一份用于无缝滚动
    var clones = track.querySelectorAll('.clone');
    Array.prototype.slice.call(clones).forEach(function (c) {
      if (c.parentNode) c.parentNode.removeChild(c);
    });
    var originals = Array.prototype.slice.call(track.children);
    var contentH = track.scrollHeight;
    var viewH = win.clientHeight;
    if (contentH > viewH + 4) {
      originals.forEach(function (node) {
        var c = node.cloneNode(true);
        c.classList.add('clone');
        track.appendChild(c);
      });
      // 复制后总高 = 2*contentH + gap，一个周期 = contentH + gap
      var gap = originals.length ? (parseFloat(getComputedStyle(originals[0]).marginBottom) || 0) : 0;
      var cycle = contentH + gap;
      var speed = 15; // px/s
      var dist = cycle;
      var dur = dist / speed;
      var start = performance.now();
      function step(now) {
        var el = now - start;
        var y = -((el / 1000) * speed) % cycle;
        var tf = 'translateY(' + y + 'px)';
        track.style.webkitTransform = tf;
        track.style.transform = tf;
        track._raf = RAF(step);
      }
      if (track._raf) CAF(track._raf);
      track._raf = RAF(step);
    }
  }

  // ---------- 天气 ----------
  var WMO = {
    0:['晴','☀'],1:['晴间多云','☀'],2:['多云','⛅'],3:['阴','☁'],
    45:['有雾','☁'],48:['雾凇','☁'],
    51:['小毛毛雨','☂'],53:['毛毛雨','☂'],55:['大毛毛雨','☂'],
    61:['小雨','☂'],63:['中雨','☂'],65:['大雨','☂'],
    71:['小雪','❄'],73:['中雪','❄'],75:['大雪','❄'],77:['雪粒','❄'],
    80:['阵雨','☂'],81:['阵雨','☂'],82:['强阵雨','☂'],
    95:['雷阵雨','⚡'],96:['雷阵雨伴冰雹','⚡'],99:['强雷阵雨伴冰雹','⚡']
  };
  function loadWeather() {
    if (!content) return;
    var lat = content.latitude || 34.2706, lon = content.longitude || 108.9453;
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,weather_code&daily=precipitation_probability_max,temperature_2m_max,temperature_2m_min' +
      '&timezone=Asia%2FShanghai&forecast_days=1';
    fetch(url).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.current) return;
      var t = Math.round(d.current.temperature_2m);
      var code = d.current.weather_code;
      var info = WMO[code] || ['天气多变','☀'];
      var pop = (d.daily && d.daily.precipitation_probability_max && d.daily.precipitation_probability_max[0]) || 0;
      var tmax = d.daily && d.daily.temperature_2m_max ? Math.round(d.daily.temperature_2m_max[0]) : null;
      var tmin = d.daily && d.daily.temperature_2m_min ? Math.round(d.daily.temperature_2m_min[0]) : null;

      var dress;
      if (t >= 30) dress = '天气炎热，注意防暑';
      else if (t >= 25) dress = '短袖即可，注意防晒';
      else if (t >= 20) dress = '长袖薄衫正合适';
      else if (t >= 15) dress = '建议加件薄外套';
      else if (t >= 10) dress = '天气较凉，多穿一点';
      else dress = '天气寒冷，注意保暖';
      var umbrella = pop >= 50 ? '记得带伞' : '不用带伞';
      var range = (tmax !== null && tmin !== null) ? (' ' + tmin + '~' + tmax + '°') : '';
      $('weatherTemp').textContent = t + '° ' + info[0] + range;
      $('weatherTip').textContent = dress + ' · ' + umbrella;
      renderWeatherIcon(code);
    }).catch(function () {
      $('weatherTemp').textContent = '天气暂不可用';
      $('weatherTip').textContent = (content.city || '') + ' · 稍后自动重试';
    });
  }
  function renderWeatherIcon(code) {
    var icon = $('weatherIcon');
    if (!icon) return;
    // 橙色标题栏背景，太阳必须白盘+深橙描边才看得清
    var SUN = '#FFF3C4', SUN_EDGE = '#D2691E', CLOUD = '#FFFFFF', CLOUD_EDGE = '#C9B69C';
    function sun(cx, cy, r) {
      var h = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + SUN + '" stroke="' + SUN_EDGE + '" stroke-width="2.2"/>';
      for (var i = 0; i < 8; i++) {
        var a = i * Math.PI / 4, r1 = r + 3, r2 = r + 7;
        h += '<line x1="' + (cx + Math.cos(a) * r1).toFixed(1) + '" y1="' + (cy + Math.sin(a) * r1).toFixed(1) +
             '" x2="' + (cx + Math.cos(a) * r2).toFixed(1) + '" y2="' + (cy + Math.sin(a) * r2).toFixed(1) +
             '" stroke="' + SUN_EDGE + '" stroke-width="2.6" stroke-linecap="round"/>';
      }
      return h;
    }
    function cloud(cx, cy, s, fill) {
      fill = fill || CLOUD;
      return '<path d="M' + (cx - 14*s) + ' ' + (cy + 6*s) +
        ' a' + (8*s) + ' ' + (8*s) + ' 0 0 1 ' + (2*s) + ' ' + (-13*s) +
        ' a' + (10*s) + ' ' + (10*s) + ' 0 0 1 ' + (18*s) + ' ' + (3*s) +
        ' a' + (7*s) + ' ' + (7*s) + ' 0 0 1 ' + (3*s) + ' ' + (10*s) + ' z" fill="' + fill + '" stroke="' + CLOUD_EDGE + '" stroke-width="1.6"/>';
    }
    var html = '';
    if (code === 0 || code === 1) {          // 晴 / 大致晴朗
      html = sun(24, 24, 11);
    } else if (code === 2) {                  // 多云：太阳 + 云
      html = sun(17, 17, 7) + cloud(24, 30, 1.15);
    } else if (code === 3) {                  // 阴：云为主 + 一点阳光
      html = sun(15, 15, 6) + cloud(26, 30, 1.2, '#F2EFE9');
    } else if (code >= 71 && code <= 77) {    // 雪
      html = cloud(24, 22, 1.15, '#EAF2F8') +
        '<circle cx="18" cy="36" r="2" fill="#FFFFFF"/><circle cx="26" cy="39" r="2" fill="#FFFFFF"/><circle cx="34" cy="36" r="2" fill="#FFFFFF"/>';
    } else if ((code >= 51 && code <= 67) || code >= 80 || (code >= 95)) { // 雨
      html = cloud(24, 20, 1.15) +
        '<path d="M18 32l-2 7M26 32l-2 7M34 32l-2 7" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>';
    } else {                                  // 其他：云
      html = cloud(24, 24, 1.2);
    }
    icon.innerHTML = html;
  }

  // ---------- 照片轮播 ----------
  function initPhotos() {
    var photos = content.photos || [];
    var img = $('photo');
    var empty = $('photoEmpty');
    if (!photos.length) {
      img.style.display = 'none';
      empty.style.display = 'block';
      if (photoTimer) { clearInterval(photoTimer); photoTimer = null; }
      return;
    }
    empty.style.display = 'none';
    img.style.display = 'block';
    var intervalMin = content.photoIntervalMinutes || 30;
    var period = intervalMin * 60 * 1000;
    // 7:00~22:00 每 intervalMin 分钟换一张；22:00 后停住，次日 7:00 再开始
    var lastSlot = Math.floor(15 * 60 / intervalMin) - 1; // 15 小时窗口的最后一个槽位
    function slotIndex(now) {
      var h = now.getHours();
      if (h < 7 || h >= 22) return lastSlot;
      var start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7, 0, 0);
      var mins = Math.floor((now - start) / 60000);
      return Math.max(0, Math.floor(mins / intervalMin));
    }
    function show() {
      var now = new Date();
      var idx = slotIndex(now) % photos.length;
      var src = photos[idx];
      if (src.indexOf('http') !== 0 && src.charAt(0) !== '/') src = ASSET + src;
      img.src = src + '?t=' + Math.floor(now.getTime() / period);
    }
    show();
    if (photoTimer) clearInterval(photoTimer);
    photoTimer = setInterval(show, period);
  }

  // ---------- 定时刷新 ----------
  function scheduleRefresh() {
    var lastVer = content ? content.version : 0;
    setInterval(function () {
      fetch(DATA_URL + '?t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.version !== lastVer) {
            lastVer = d.version;
            content = d;
            renderAll();
          }
        }).catch(function () {});
      // 每分钟校正日期/倒计时跨天，并按当天日期重新判断作业是否过期
      renderDate();
      renderCountdown();
      renderTheme();
      renderHomework();
    }, 60000);
  }

  // ---------- 启动 ----------
  renderClock();
  setInterval(renderClock, 1000);
  loadContent(function () { scheduleRefresh(); });
  // 每 30 秒校正日期显示（跨零点）
  setInterval(function () { renderDate(); }, 30000);
})();
