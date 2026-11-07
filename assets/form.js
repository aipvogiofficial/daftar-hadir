/* Halaman peserta: memuat kegiatan dari ?k=ID, tanda tangan, kirim ke Apps Script */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var form = $('form'), msg = $('msg');
  var id = (new URLSearchParams(location.search).get('k') || '').replace(/[^A-Za-z0-9]/g, '');

  function showMsg(t) { msg.textContent = t; msg.hidden = false; }

  /* ---------- Tanda tangan ---------- */
  var canvas = $('sig'), ctx = canvas.getContext('2d');
  var drawing = false, empty = true, last = null, lastW = 0;

  function setupCanvas() {
    var w = canvas.offsetWidth, h = canvas.offsetHeight;
    if (!w || w === lastW) return; // abaikan resize akibat keyboard HP
    var keep = empty ? null : canvas.toDataURL();
    var ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = w * ratio; canvas.height = h * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = ctx.fillStyle = '#0b2a6f';
    lastW = w;
    if (keep) { var img = new Image(); img.onload = function () { ctx.drawImage(img, 0, 0, w, h); }; img.src = keep; }
  }
  function pos(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault(); drawing = true; last = pos(e); empty = false;
    canvas.setPointerCapture(e.pointerId);
    ctx.beginPath(); ctx.arc(last.x, last.y, 1.1, 0, Math.PI * 2); ctx.fill();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drawing) return; e.preventDefault();
    var p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p;
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) { canvas.addEventListener(ev, function () { drawing = false; }); });
  $('clear').addEventListener('click', function () { ctx.clearRect(0, 0, canvas.width, canvas.height); empty = true; });
  window.addEventListener('resize', setupCanvas);

  function sigData() {
    var out = document.createElement('canvas');
    out.width = 400; out.height = Math.round(400 * canvas.height / canvas.width);
    out.getContext('2d').drawImage(canvas, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  /* ---------- Muat kegiatan ---------- */
  if (!id) {
    $('k-nama').textContent = 'Link tidak lengkap';
    showMsg('Silakan buka formulir daftar hadir melalui link kegiatan yang dibagikan panitia.');
    return;
  }

  DH.api('getKegiatan', { id: id }).then(function (r) {
    var k = r.item;
    document.title = 'Daftar Hadir — ' + k.nama;
    $('k-nama').textContent = k.nama;
    $('k-info').textContent = [k.tanggal_teks, k.waktu, k.tempat].filter(Boolean).join(' · ');
    $('foot').textContent = k.org || '';
    if (k.status !== 'Buka') { showMsg('Daftar hadir kegiatan ini sudah ditutup.'); return; }
    form.hidden = false;
    setupCanvas();
    try {
      ['instansi', 'jabatan'].forEach(function (n) {
        var v = localStorage.getItem('dh_' + n);
        if (v && !form[n].value) form[n].value = v;
      });
    } catch (e) {}
  }).catch(function (e) {
    $('k-nama').textContent = 'Kegiatan tidak dapat dimuat';
    showMsg(e.message);
  });

  /* ---------- Kirim ---------- */
  var errBox = $('err'), btn = $('send');
  function showErr(t) { errBox.textContent = t; errBox.hidden = false; errBox.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errBox.hidden = true;
    if (!form.nama.value.trim()) return showErr('Nama lengkap wajib diisi.');
    if (!form.instansi.value.trim()) return showErr('Instansi wajib diisi.');
    if (form.email.value && !form.email.checkValidity()) return showErr('Format email tidak valid.');
    if (empty) return showErr('Silakan bubuhkan tanda tangan terlebih dahulu.');

    var data = { kegiatan_id: id, ttd: sigData() };
    ['website', 'nama', 'nip', 'instansi', 'jabatan', 'hp', 'email'].forEach(function (n) { data[n] = form[n].value.trim(); });

    btn.disabled = true; btn.textContent = 'Mengirim…';
    DH.api('submit', { data: data }).then(function (r) {
      try {
        localStorage.setItem('dh_instansi', data.instansi);
        localStorage.setItem('dh_jabatan', data.jabatan);
      } catch (e) {}
      form.hidden = true;
      $('ok').textContent = r.message;
      $('ok').hidden = false;
      $('ok').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }).catch(function (e) {
      showErr(e.message);
    }).finally(function () {
      btn.disabled = false; btn.textContent = 'Kirim Kehadiran';
    });
  });
})();
