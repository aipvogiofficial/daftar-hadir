/* Halaman admin: login, kelola kegiatan, peserta, PDF, QR, pengaturan */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var el = DH.el;
  var TOKEN_KEY = 'dh_admin_token', USER_KEY = 'dh_admin_user';
  var appName = (window.APP_CONFIG || {}).NAMA_APLIKASI || 'Daftar Hadir';
  document.querySelectorAll('.app-name').forEach(function (n) { n.textContent = appName; });

  function token() { return sessionStorage.getItem(TOKEN_KEY) || ''; }

  // Panggilan admin: token otomatis, sesi habis → kembali ke login
  function call(action, data) {
    return DH.api(action, Object.assign({ token: token() }, data || {})).catch(function (e) {
      if (e.code === 'SESI_HABIS') { logoutLocal(); throw new Error('Sesi berakhir, silakan masuk lagi.'); }
      throw e;
    });
  }

  function toast(text, isErr) {
    var t = $('toast');
    t.textContent = text;
    t.className = 'toast' + (isErr ? ' toast-err' : '');
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 4500);
  }

  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || 'Memproses…'; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }

  function formLink(id) {
    return new URL('index.html?k=' + encodeURIComponent(id), location.href).href;
  }

  /* ======================= LOGIN / LOGOUT ======================= */

  function showLogin() { $('login-view').hidden = false; $('dash-view').hidden = true; }
  function showDash() {
    $('login-view').hidden = true; $('dash-view').hidden = false;
    var u = JSON.parse(sessionStorage.getItem(USER_KEY) || '{}');
    $('user-nama').textContent = u.nama || u.username || '';
    loadList();
  }
  function logoutLocal() { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY); showLogin(); }

  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, btn = $('login-btn'), err = $('login-err');
    err.hidden = true;
    busy(btn, true, 'Memeriksa…');
    DH.api('login', { username: f.username.value, password: f.password.value }).then(function (r) {
      sessionStorage.setItem(TOKEN_KEY, r.token);
      sessionStorage.setItem(USER_KEY, JSON.stringify(r.user));
      f.reset();
      showDash();
    }).catch(function (e2) {
      err.textContent = e2.message; err.hidden = false;
    }).finally(function () { busy(btn, false); });
  });

  $('logout').addEventListener('click', function () {
    DH.api('logout', { token: token() }).catch(function () {});
    logoutLocal();
  });

  /* ============================ TAB ============================ */

  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.tabs button').forEach(function (x) { x.classList.toggle('active', x === b); });
      $('tab-kegiatan').hidden = b.dataset.tab !== 'kegiatan';
      $('tab-pengaturan').hidden = b.dataset.tab !== 'pengaturan';
      if (b.dataset.tab === 'pengaturan') loadSettings();
    });
  });

  /* ========================= KEGIATAN ========================= */

  var cf = $('create-form');
  cf.tanggal.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  cf.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = {};
    ['nama', 'tanggal', 'waktu', 'tempat', 'penyelenggara', 'pj_nama', 'pj_jabatan'].forEach(function (n) { data[n] = cf[n].value.trim(); });
    var btn = $('create-btn');
    busy(btn, true, 'Menyimpan…');
    call('createKegiatan', { data: data }).then(function (r) {
      toast('Kegiatan "' + r.item.nama + '" dibuat. Bagikan link atau QR-nya ke peserta.');
      ['nama', 'waktu', 'tempat'].forEach(function (n) { cf[n].value = ''; });
      loadList();
      showQR(r.item);
    }).catch(function (e2) { toast(e2.message, true); })
      .finally(function () { busy(btn, false); });
  });

  $('reload').addEventListener('click', loadList);

  function loadList() {
    var box = $('list');
    box.innerHTML = '<p class="muted">Memuat…</p>';
    call('listKegiatan').then(function (r) {
      box.innerHTML = '';
      if (!r.items.length) { box.appendChild(el('p', { class: 'muted', text: 'Belum ada kegiatan. Buat kegiatan pertama di atas.' })); return; }
      r.items.forEach(function (k) { box.appendChild(renderItem(k)); });
    }).catch(function (e) { box.innerHTML = ''; box.appendChild(el('p', { class: 'err', text: e.message })); });
  }

  function renderItem(k) {
    var buka = k.status === 'Buka';
    var link = formLink(k.id);
    return el('div', { class: 'item' }, [
      el('div', { class: 'item-main' }, [
        el('div', { class: 'item-title' }, [
          el('span', { class: 'badge ' + (buka ? 'badge-on' : 'badge-off'), text: k.status }),
          el('strong', { text: k.nama })
        ]),
        el('div', { class: 'muted', text: [k.tanggal_teks, k.waktu, k.tempat].filter(Boolean).join(' · ') }),
        el('div', { class: 'count', text: k.jumlah + ' peserta hadir' })
      ]),
      el('div', { class: 'item-actions' }, [
        el('button', { class: 'btn-sm', text: 'Salin link', onclick: function (e) { copy(link, e.target); } }),
        el('button', { class: 'btn-sm', text: 'QR', onclick: function () { showQR(k); } }),
        el('button', { class: 'btn-sm', text: 'Peserta', onclick: function () { showPeserta(k); } }),
        el('button', { class: 'btn-sm btn-primary-sm', text: 'Unduh PDF', onclick: function (e) { downloadPdf(k, e.target); } }),
        el('button', { class: 'btn-sm', text: buka ? 'Tutup' : 'Buka lagi', onclick: function (e) { toggle(k, e.target); } })
      ])
    ]);
  }

  function copy(text, btn) {
    var done = function () { var t = btn.textContent; btn.textContent = 'Tersalin ✓'; setTimeout(function () { btn.textContent = t; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { prompt('Salin link ini:', text); });
    else prompt('Salin link ini:', text);
  }

  function toggle(k, btn) {
    var status = k.status === 'Buka' ? 'Tutup' : 'Buka';
    if (status === 'Tutup' && !confirm('Tutup daftar hadir "' + k.nama + '"? Peserta tidak bisa mengisi lagi.')) return;
    busy(btn, true, '…');
    call('setStatus', { id: k.id, status: status }).then(function () {
      toast('Status "' + k.nama + '" sekarang ' + status + '.');
      loadList();
    }).catch(function (e) { toast(e.message, true); busy(btn, false); });
  }

  function downloadPdf(k, btn) {
    busy(btn, true, 'Membuat PDF…');
    call('pdf', { id: k.id }).then(function (r) {
      DH.downloadBase64(r.base64, r.filename, 'application/pdf');
      toast('PDF daftar hadir (' + r.jumlah + ' peserta) diunduh.');
    }).catch(function (e) { toast('Gagal membuat PDF: ' + e.message, true); })
      .finally(function () { busy(btn, false); });
  }

  /* =========================== MODAL =========================== */

  function openModal(title, body) {
    $('modal-title').textContent = title;
    var b = $('modal-body'); b.innerHTML = ''; b.appendChild(body);
    $('modal').hidden = false;
  }
  function closeModal() { $('modal').hidden = true; }
  $('modal-close').addEventListener('click', closeModal);
  $('modal').addEventListener('click', function (e) { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  function showQR(k) {
    var link = formLink(k.id);
    var wrap = el('div', { class: 'qr-wrap' });
    if (typeof qrcode === 'function') {
      var qr = qrcode(0, 'M'); qr.addData(link); qr.make();
      var img = el('img', { src: qr.createDataURL(8, 16), alt: 'QR daftar hadir', class: 'qr-img' });
      wrap.appendChild(img);
      wrap.appendChild(el('button', {
        class: 'btn btn-primary', text: 'Unduh gambar QR',
        onclick: function () {
          var c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          var a = document.createElement('a'); a.href = c.toDataURL('image/png');
          a.download = 'QR Daftar Hadir - ' + k.nama.replace(/[\\/:*?"<>|]/g, '').slice(0, 60) + '.png'; a.click();
        }
      }));
    } else {
      wrap.appendChild(el('p', { class: 'muted', text: 'Pustaka QR tidak termuat (cek koneksi). Link tetap bisa disalin.' }));
    }
    var inp = el('input', { value: link, readonly: 'readonly', class: 'link-input' });
    wrap.appendChild(inp);
    wrap.appendChild(el('button', { class: 'btn-sm', text: 'Salin link', onclick: function (e) { copy(link, e.target); } }));
    openModal(k.nama, wrap);
  }

  function showPeserta(k) {
    var body = el('div', {}, [el('p', { class: 'muted', text: 'Memuat…' })]);
    openModal('Peserta — ' + k.nama, body);
    call('listPeserta', { id: k.id }).then(function (r) {
      body.innerHTML = '';
      var items = r.items;
      body.appendChild(el('div', { class: 'peserta-bar' }, [
        el('strong', { text: items.length + ' peserta' }),
        el('input', { type: 'search', placeholder: 'Cari nama / instansi…', class: 'search', oninput: function (e) {
          var q = e.target.value.toLowerCase();
          body.querySelectorAll('tbody tr').forEach(function (tr) { tr.hidden = tr.textContent.toLowerCase().indexOf(q) < 0; });
        } }),
        el('button', { class: 'btn-sm', text: 'Unduh CSV (Excel)', onclick: function () { csv(k, items); } })
      ]));
      var cols = ['waktu', 'nama', 'nip', 'instansi', 'jabatan', 'hp', 'email'];
      var head = ['No', 'Waktu isi', 'Nama', 'NIP/NIK', 'Instansi', 'Jabatan', 'No. HP', 'Email'];
      var tbody = el('tbody');
      items.forEach(function (p, i) {
        tbody.appendChild(el('tr', {}, [el('td', { text: String(i + 1) })].concat(cols.map(function (c) { return el('td', { text: p[c] }); }))));
      });
      if (!items.length) tbody.appendChild(el('tr', {}, [el('td', { colspan: '8', class: 'muted', text: 'Belum ada peserta.' })]));
      body.appendChild(el('div', { class: 'table-wrap' }, [
        el('table', { class: 'tbl' }, [el('thead', {}, [el('tr', {}, head.map(function (h) { return el('th', { text: h }); }))]), tbody])
      ]));
    }).catch(function (e) { body.innerHTML = ''; body.appendChild(el('p', { class: 'err', text: e.message })); });
  }

  function csv(k, items) {
    var cols = ['waktu', 'nama', 'nip', 'instansi', 'jabatan', 'hp', 'email'];
    var q = function (v) { v = String(v == null ? '' : v); return '"' + v.replace(/"/g, '""') + '"'; };
    var lines = [['No', 'Waktu', 'Nama', 'NIP/NIK', 'Instansi', 'Jabatan', 'No HP', 'Email'].map(q).join(';')];
    items.forEach(function (p, i) { lines.push([i + 1].concat(cols.map(function (c) { return c === 'nip' || c === 'hp' ? '\t' + p[c] : p[c]; })).map(q).join(';')); });
    DH.downloadBlob(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }),
      'Peserta - ' + k.nama.replace(/[\\/:*?"<>|]/g, '').slice(0, 60) + '.csv');
  }

  /* ========================= PENGATURAN ========================= */

  var sf = $('set-form');
  function loadSettings() {
    call('getSettings').then(function (r) {
      ['org_nama', 'org_sub', 'logo_url'].forEach(function (n) { sf[n].value = r.settings[n] || ''; });
    }).catch(function (e) { toast(e.message, true); });
  }
  sf.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = sf.querySelector('button'); busy(btn, true, 'Menyimpan…');
    var s = {}; ['org_nama', 'org_sub', 'logo_url'].forEach(function (n) { s[n] = sf[n].value.trim(); });
    call('saveSettings', { settings: s }).then(function () { toast('Pengaturan disimpan.'); })
      .catch(function (e2) { toast(e2.message, true); }).finally(function () { busy(btn, false); });
  });

  var pf = $('pw-form');
  pf.addEventListener('submit', function (e) {
    e.preventDefault();
    if (pf.new1.value !== pf.new2.value) { toast('Ulangan password baru tidak sama.', true); return; }
    var btn = pf.querySelector('button'); busy(btn, true, 'Menyimpan…');
    call('changePassword', { oldPassword: pf.old.value, newPassword: pf.new1.value }).then(function (r) {
      toast(r.message); pf.reset();
    }).catch(function (e2) { toast(e2.message, true); }).finally(function () { busy(btn, false); });
  });

  /* ============================ MULAI ============================ */

  if (token()) {
    call('me').then(function (r) { sessionStorage.setItem(USER_KEY, JSON.stringify(r.user)); showDash(); })
      .catch(function () { showLogin(); });
  } else {
    showLogin();
  }
})();
