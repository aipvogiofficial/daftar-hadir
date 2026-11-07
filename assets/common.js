/* Fungsi bersama: pemanggilan API Apps Script & utilitas kecil */
(function () {
  'use strict';

  async function api(action, data) {
    var url = (window.APP_CONFIG || {}).API_URL || '';
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url) || url.indexOf('GANTI_') > -1) {
      throw new Error('URL Apps Script belum diisi di config.js.');
    }
    var res;
    try {
      // text/plain → tidak memicu preflight CORS di Apps Script
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action: action }, data || {}))
      });
    } catch (e) {
      throw new Error('Tidak dapat terhubung ke server. Periksa koneksi internet Anda.');
    }
    var json;
    try { json = await res.json(); } catch (e) { throw new Error('Respons server tidak valid. Pastikan Web App di-deploy dengan akses "Anyone".'); }
    if (!json.ok) {
      var err = new Error(json.error || 'Permintaan gagal.');
      err.code = json.error;
      throw err;
    }
    return json;
  }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }

  function downloadBase64(b64, filename, mime) {
    var bin = atob(b64), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    downloadBlob(new Blob([arr], { type: mime }), filename);
  }

  function downloadBlob(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  window.DH = { api: api, el: el, downloadBase64: downloadBase64, downloadBlob: downloadBlob };
})();
