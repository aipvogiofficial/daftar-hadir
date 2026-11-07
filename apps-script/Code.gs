/**
 * DAFTAR HADIR AIPVOGI — Backend Google Apps Script
 * Tampilan (index.html & admin.html) di GitHub Pages, data di Google Sheet ini,
 * tanda tangan di folder Google Drive privat, PDF dibuat di sini.
 *
 * Aksi publik  : getKegiatan, submit, login
 * Aksi admin   : perlu token hasil login (berlaku 6 jam)
 *
 * PASANG: Extensions → Apps Script → tempel file ini → Run setup() → Deploy Web app
 *         (Execute as: Me, Who has access: Anyone). Lihat README.md.
 */

const TZ = 'Asia/Makassar';
const SH = { KEG: 'Kegiatan', PES: 'Peserta', ADM: 'Admin', SET: 'Pengaturan' };
const HEAD = {
  Kegiatan:   ['id', 'nama', 'tanggal', 'waktu', 'tempat', 'penyelenggara', 'pj_nama', 'pj_jabatan', 'status', 'dibuat'],
  Peserta:    ['waktu', 'kegiatan_id', 'nama', 'instansi', 'jabatan', 'nip', 'hp', 'email', 'ttd_id'],
  Admin:      ['username', 'nama', 'salt', 'hash', 'dibuat'],
  Pengaturan: ['kunci', 'nilai']
};
const DEFAULT_SET = {
  org_nama: 'ASOSIASI INSTITUSI PENDIDIKAN TINGGI VOKASI GIZI INDONESIA (AIPVOGI)',
  org_sub: '',
  logo_url: ''
};

/* ============================ SETUP (jalankan sekali) ============================ */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HEAD).forEach(n => prepSheet_(ss, n, HEAD[n]));

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('FOLDER_ID')) {
    props.setProperty('FOLDER_ID', DriveApp.createFolder('Tanda Tangan Daftar Hadir AIPVOGI').getId());
  }

  const set = ss.getSheetByName(SH.SET);
  if (set.getLastRow() < 2) {
    Object.keys(DEFAULT_SET).forEach(k => set.appendRow([k, DEFAULT_SET[k]]));
  }

  const adm = ss.getSheetByName(SH.ADM);
  if (adm.getLastRow() < 2) {
    const pw = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
    tambahAdmin_('admin', 'Administrator', pw);
    Logger.log('SETUP SELESAI.');
    Logger.log('Login admin pertama →  username: admin   password: ' + pw);
    Logger.log('Segera ganti password lewat menu Pengaturan di halaman admin.');
  } else {
    Logger.log('SETUP SELESAI (admin sudah ada).');
  }
}

/** Tambah admin lain: ubah nilai di bawah, lalu Run fungsi ini. */
function tambahAdminManual() {
  const username = 'sekretariat';
  const nama = 'Sekretariat AIPVOGI';
  const pw = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  tambahAdmin_(username, nama, pw);
  Logger.log('Admin dibuat → username: ' + username + '   password: ' + pw);
}

/** Lupa password: isi username, Run, password baru muncul di log. */
function resetPasswordManual() {
  const username = 'admin';
  const pw = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  setPassword_(username, pw);
  Logger.log('Password baru untuk ' + username + ': ' + pw);
}

function prepSheet_(ss, name, head) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.getRange(1, 1, sh.getMaxRows(), head.length).setNumberFormat('@');
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e8f0e8');
  sh.setFrozenRows(1);
}

/* ================================== ROUTER ================================== */

function doGet() {
  return out_({ ok: true, service: 'daftar-hadir-aipvogi' });
}

function doPost(e) {
  try {
    const q = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (q.action) {
      // --- publik ---
      case 'getKegiatan':    return out_({ ok: true, item: publikKegiatan_(getKegiatan_(q.id)) });
      case 'submit':         return out_(submit_(q.data || {}));
      case 'login':          return out_(login_(q.username, q.password));
    }
    // --- admin ---
    const user = auth_(q.token);
    switch (q.action) {
      case 'me':             return out_({ ok: true, user: user });
      case 'logout':         CacheService.getScriptCache().remove('tok_' + q.token); return out_({ ok: true });
      case 'listKegiatan':   return out_({ ok: true, items: listKegiatan_() });
      case 'createKegiatan': return out_({ ok: true, item: createKegiatan_(q.data || {}) });
      case 'setStatus':      return out_({ ok: true, item: setStatus_(q.id, q.status) });
      case 'listPeserta':    return out_({ ok: true, kegiatan: getKegiatan_(q.id), items: listPeserta_(q.id) });
      case 'pdf':            return out_(pdf_(q.id));
      case 'getSettings':    return out_({ ok: true, settings: getSettings_() });
      case 'saveSettings':   return out_({ ok: true, settings: saveSettings_(q.settings || {}) });
      case 'changePassword': return out_(changePassword_(user.username, q.oldPassword, q.newPassword));
      default:               return out_({ ok: false, error: 'Aksi tidak dikenal.' });
    }
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ================================== AUTH ================================== */

function hash_(salt, pw) {
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pw, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(d);
}

function tambahAdmin_(username, nama, pw) {
  username = String(username).trim().toLowerCase();
  if (rows_(SH.ADM).some(a => a.username === username)) throw new Error('Username sudah ada.');
  const salt = Utilities.getUuid();
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.ADM)
    .appendRow([username, nama, salt, hash_(salt, pw), now_()]);
}

function setPassword_(username, pw) {
  const a = rows_(SH.ADM).find(x => x.username === String(username).toLowerCase());
  if (!a) throw new Error('Username tidak ditemukan.');
  const salt = Utilities.getUuid();
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.ADM).getRange(a._row, 3, 1, 2).setValues([[salt, hash_(salt, pw)]]);
}

function login_(username, password) {
  username = String(username || '').trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const failKey = 'fail_' + username;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= 5) return { ok: false, error: 'Terlalu banyak percobaan gagal. Coba lagi 15 menit lagi.' };

  const a = rows_(SH.ADM).find(x => x.username === username);
  if (!a || hash_(a.salt, String(password || '')) !== a.hash) {
    cache.put(failKey, String(fails + 1), 900);
    Utilities.sleep(800);
    return { ok: false, error: 'Username atau password salah.' };
  }
  cache.remove(failKey);
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('tok_' + token, JSON.stringify({ username: a.username, nama: a.nama }), 21600);
  return { ok: true, token: token, user: { username: a.username, nama: a.nama } };
}

function auth_(token) {
  if (!token) throw new Error('SESI_HABIS');
  const cache = CacheService.getScriptCache();
  const v = cache.get('tok_' + token);
  if (!v) throw new Error('SESI_HABIS');
  cache.put('tok_' + token, v, 21600); // perpanjang sesi
  return JSON.parse(v);
}

function changePassword_(username, oldPw, newPw) {
  const a = rows_(SH.ADM).find(x => x.username === username);
  if (!a || hash_(a.salt, String(oldPw || '')) !== a.hash) return { ok: false, error: 'Password lama salah.' };
  if (String(newPw || '').length < 8) return { ok: false, error: 'Password baru minimal 8 karakter.' };
  setPassword_(username, String(newPw));
  return { ok: true, message: 'Password berhasil diganti.' };
}

/* ================================ PENGATURAN ================================ */

function getSettings_() {
  const s = Object.assign({}, DEFAULT_SET);
  rows_(SH.SET).forEach(r => s[r.kunci] = r.nilai);
  return s;
}

function saveSettings_(inp) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.SET);
  const ada = rows_(SH.SET);
  Object.keys(DEFAULT_SET).forEach(k => {
    if (!(k in inp)) return;
    const v = clean_(inp[k], 300);
    const r = ada.find(x => x.kunci === k);
    if (r) sh.getRange(r._row, 2).setValue(v); else sh.appendRow([k, v]);
  });
  return getSettings_();
}

/* ================================= KEGIATAN ================================= */

function rows_(name) {
  const head = HEAD[name];
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" tidak ada. Jalankan setup() dulu.');
  const vals = sh.getDataRange().getDisplayValues();
  vals.shift();
  const out = [];
  vals.forEach((r, i) => {
    if (r[0] === '') return;
    const o = { _row: i + 2 };
    head.forEach((h, j) => o[h] = r[j] == null ? '' : r[j]);
    out.push(o);
  });
  return out;
}

function getKegiatan_(id) {
  const k = rows_(SH.KEG).find(x => x.id === String(id || ''));
  if (!k) throw new Error('Kegiatan tidak ditemukan.');
  k.tanggal_teks = tanggalIndo_(k.tanggal);
  delete k._row;
  return k;
}

function publikKegiatan_(k) {
  return { id: k.id, nama: k.nama, tanggal_teks: k.tanggal_teks, waktu: k.waktu, tempat: k.tempat,
           penyelenggara: k.penyelenggara, status: k.status, org: getSettings_().org_nama };
}

function listKegiatan_() {
  const count = {};
  rows_(SH.PES).forEach(p => count[p.kegiatan_id] = (count[p.kegiatan_id] || 0) + 1);
  return rows_(SH.KEG).map(k => {
    delete k._row;
    k.tanggal_teks = tanggalIndo_(k.tanggal);
    k.jumlah = count[k.id] || 0;
    return k;
  }).sort((a, b) => (b.tanggal + b.dibuat).localeCompare(a.tanggal + a.dibuat));
}

function createKegiatan_(d) {
  const nama = clean_(d.nama, 200);
  const tanggal = clean_(d.tanggal, 10);
  if (!nama) throw new Error('Nama kegiatan wajib diisi.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) throw new Error('Format tanggal tidak valid.');
  const id = 'K' + Utilities.formatDate(new Date(), TZ, 'yyMMdd') + Math.random().toString(36).slice(2, 7).toUpperCase();
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.KEG).appendRow([
    id, nama, tanggal, clean_(d.waktu, 60), clean_(d.tempat, 200), clean_(d.penyelenggara, 200),
    clean_(d.pj_nama, 120), clean_(d.pj_jabatan, 120), 'Buka', now_()
  ]);
  return getKegiatan_(id);
}

function setStatus_(id, status) {
  if (['Buka', 'Tutup'].indexOf(status) < 0) throw new Error('Status tidak valid.');
  const k = rows_(SH.KEG).find(x => x.id === String(id));
  if (!k) throw new Error('Kegiatan tidak ditemukan.');
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.KEG)
    .getRange(k._row, HEAD.Kegiatan.indexOf('status') + 1).setValue(status);
  return getKegiatan_(id);
}

/* ================================= PESERTA ================================= */

function listPeserta_(id) {
  return rows_(SH.PES).filter(p => p.kegiatan_id === String(id)).map(p => ({
    waktu: p.waktu, nama: p.nama, nip: p.nip, instansi: p.instansi, jabatan: p.jabatan, hp: p.hp, email: p.email
  }));
}

function submit_(d) {
  if (d.website) return { ok: true, message: 'Terima kasih.' }; // jebakan bot
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const k = getKegiatan_(d.kegiatan_id);
    if (k.status !== 'Buka') return { ok: false, error: 'Daftar hadir kegiatan ini sudah ditutup.' };

    const nama = clean_(d.nama, 150);
    const instansi = clean_(d.instansi, 200);
    if (!nama || !instansi) return { ok: false, error: 'Nama dan instansi wajib diisi.' };

    const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (rows_(SH.PES).some(p => p.kegiatan_id === k.id && norm(p.nama) === norm(nama))) {
      return { ok: false, error: 'Nama ini sudah tercatat hadir pada kegiatan ini.' };
    }

    const m = String(d.ttd || '').match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return { ok: false, error: 'Tanda tangan belum diisi atau tidak valid.' };
    const bytes = Utilities.base64Decode(m[1]);
    if (bytes.length > 250000) return { ok: false, error: 'Ukuran tanda tangan terlalu besar.' };
    const file = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_ID'))
      .createFile(Utilities.newBlob(bytes, 'image/png', k.id + '_' + Date.now() + '.png'));

    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.PES).appendRow([
      now_(), k.id, nama, instansi, clean_(d.jabatan, 150), clean_(d.nip, 30),
      String(d.hp || '').replace(/[^0-9]/g, '').slice(0, 15), clean_(d.email, 120), file.getId()
    ]);
    return { ok: true, message: 'Terima kasih, ' + nama + '. Kehadiran Anda telah tercatat.' };
  } finally {
    lock.releaseLock();
  }
}

/* =================================== PDF =================================== */

function pdf_(id) {
  const k = getKegiatan_(id);
  const org = getSettings_();
  const pes = rows_(SH.PES).filter(p => p.kegiatan_id === k.id);

  let logo = '';
  if (org.logo_url) {
    try {
      const r = UrlFetchApp.fetch(org.logo_url, { muteHttpExceptions: true, followRedirects: true });
      if (r.getResponseCode() === 200) {
        const b = r.getBlob();
        logo = '<img src="data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()) + '" style="height:72px">';
      }
    } catch (e) { /* logo opsional */ }
  }

  const rowsHtml = pes.map((p, i) => {
    let ttd = '';
    try {
      ttd = '<img src="data:image/png;base64,' + Utilities.base64Encode(DriveApp.getFileById(p.ttd_id).getBlob().getBytes()) +
            '" style="height:38px;max-width:125px">';
    } catch (e) { ttd = '<i style="color:#999">-</i>'; }
    const n = i + 1;
    return '<tr>' +
      '<td class="c">' + n + '</td>' +
      '<td>' + esc_(p.nama) + (p.nip ? '<br><span class="s">NIP/NIK: ' + esc_(p.nip) + '</span>' : '') + '</td>' +
      '<td>' + esc_(p.instansi) + '</td>' +
      '<td>' + esc_(p.jabatan) + '</td>' +
      '<td>' + esc_(p.hp) + '</td>' +
      '<td class="ttd"><div style="text-align:' + (n % 2 ? 'left' : 'right') + '"><span class="s">' + n + '.</span> ' + ttd + '</div></td>' +
      '</tr>';
  }).join('');

  const info = (label, val) => val ? '<tr><td style="width:105px">' + label + '</td><td style="width:8px">:</td><td>' + val + '</td></tr>' : '';

  const html =
    '<html><head><meta charset="utf-8"><style>' +
    '@page{size:A4;margin:1.5cm}' +
    'body{font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;color:#000}' +
    '.kop{width:100%;border-bottom:3px double #000;margin-bottom:12px}.kop td{border:none;vertical-align:middle}' +
    '.org{font-size:13.5pt;font-weight:bold;text-align:center}.sub{font-size:9.5pt;text-align:center}' +
    'h2{text-align:center;font-size:13pt;margin:6px 0 10px;letter-spacing:1px}' +
    '.info td{border:none;padding:1px 3px;vertical-align:top}' +
    '.tbl{width:100%;border-collapse:collapse;margin-top:10px}' +
    '.tbl th,.tbl td{border:1px solid #000;padding:4px 5px;vertical-align:middle}' +
    '.tbl th{background:#e6e6e6;font-size:10pt}' +
    '.c{text-align:center}.s{font-size:8.5pt;color:#333}.ttd{width:150px;height:44px}' +
    '.pj{margin-top:24px;width:100%}.pj td{border:none}' +
    '</style></head><body>' +
    '<table class="kop"><tr><td style="width:85px">' + logo + '</td><td>' +
      '<div class="org">' + esc_(org.org_nama) + '</div>' +
      (org.org_sub ? '<div class="sub">' + esc_(org.org_sub) + '</div>' : '') +
    '</td><td style="width:85px"></td></tr></table>' +
    '<h2>DAFTAR HADIR</h2>' +
    '<table class="info">' +
      info('Kegiatan', '<b>' + esc_(k.nama) + '</b>') +
      info('Hari/Tanggal', esc_(k.tanggal_teks)) +
      info('Waktu', esc_(k.waktu)) +
      info('Tempat', esc_(k.tempat)) +
      info('Penyelenggara', esc_(k.penyelenggara)) +
    '</table>' +
    '<table class="tbl"><thead><tr>' +
      '<th style="width:26px">No</th><th>Nama</th><th>Instansi</th><th>Jabatan</th><th style="width:88px">No. HP</th><th>Tanda Tangan</th>' +
    '</tr></thead><tbody>' +
      (rowsHtml || '<tr><td colspan="6" class="c"><i>Belum ada peserta</i></td></tr>') +
    '</tbody></table>' +
    (k.pj_nama
      ? '<table class="pj"><tr><td style="width:58%"></td><td>' +
          esc_(k.tanggal_teks.replace(/^[^,]+,\s*/, '')) + '<br>' + esc_(k.pj_jabatan || 'Penanggung Jawab') +
          '<br><br><br><br><b><u>' + esc_(k.pj_nama) + '</u></b></td></tr></table>'
      : '') +
    '</body></html>';

  const pdf = Utilities.newBlob(html, 'text/html', 'dh.html').getAs('application/pdf');
  const fname = 'Daftar Hadir - ' + k.nama.replace(/[\\/:*?"<>|]/g, '').slice(0, 80) + ' - ' + k.tanggal + '.pdf';
  return { ok: true, filename: fname, base64: Utilities.base64Encode(pdf.getBytes()), jumlah: pes.length };
}

/* ================================= UTILITAS ================================= */

function now_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
}

function clean_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').trim()
    .replace(/^[=+\-@]+/, '').slice(0, max || 200);
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function tanggalIndo_(ymd) {
  const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][d.getDay()];
  const bln = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][d.getMonth()];
  return hari + ', ' + (+m[3]) + ' ' + bln + ' ' + m[1];
}
