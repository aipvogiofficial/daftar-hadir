# Daftar Hadir AIPVOGI

Aplikasi daftar hadir dengan tanda tangan digital, pengganti Google Form + Autocrat.

- **Tampilan**: GitHub Pages (gratis, tidak tergantung server AIPVOGI)
- **Database**: Google Sheet. Tanda tangan disimpan di folder Google Drive privat.
- **Output**: PDF daftar hadir lengkap dengan kop, tabel, tanda tangan, dan penanggung jawab. Tersedia juga CSV untuk Excel.

```
Peserta (HP) ──► index.html?k=ID  ─┐
                                    ├──► Google Apps Script ──► Google Sheet + Drive
Admin        ──► admin.html (login)─┘                         └──► PDF daftar hadir
```

## Isi repositori

| File | Fungsi |
|---|---|
| `index.html` | Formulir peserta (dibuka dari link/QR kegiatan) |
| `admin.html` | Halaman admin: login, buat kegiatan, link & QR, peserta, PDF, CSV, pengaturan kop, ganti password |
| `config.js` | **Satu-satunya file yang perlu diedit**: URL Apps Script |
| `assets/` | CSS & JavaScript. Taruh juga logo di sini, mis. `assets/logo.png` |
| `apps-script/Code.gs` | Kode backend. Disalin ke Apps Script, **tidak** dijalankan di GitHub |

---

## Langkah 1 — Google Sheet & Apps Script

1. Login dengan akun Google pemilik data. Sebaiknya akun organisasi dengan **verifikasi 2 langkah aktif**.
2. Buat Google Sheet baru, mis. **Database Daftar Hadir AIPVOGI**.
3. Buka **Extensions → Apps Script**. Hapus isi bawaan, tempel seluruh isi `apps-script/Code.gs`, lalu klik **Save**.
4. Pilih fungsi **`setup`** lalu klik **Run**. Izinkan akses: *Review permissions → Advanced → Go to … → Allow*.
5. Buka **Execution log** dan catat **username `admin` dan password awal** yang muncul di sana.
6. Klik **Deploy → New deployment → ⚙ → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Klik **Deploy**, lalu salin **Web app URL** (berakhiran `/exec`).

> Kalau `Code.gs` diubah di kemudian hari: **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. Dengan cara ini URL tetap sama dan `config.js` tidak perlu diubah.

## Langkah 2 — GitHub Pages

1. Buat repositori baru di GitHub, mis. `daftar-hadir-aipvogi` (Public).
2. Unggah **semua isi** folder ini ke repositori (**Add file → Upload files**), dengan struktur folder tetap sama.
3. Edit `config.js` dan tempel URL dari langkah 1.6:
   ```js
   API_URL: 'https://script.google.com/macros/s/AKfy.../exec',
   ```
4. Buka **Settings → Pages → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
5. Tunggu 1–2 menit. Aplikasi bisa diakses di:
   - Admin: `https://USERNAME.github.io/daftar-hadir-aipvogi/admin.html`
   - Formulir peserta: link dibuat otomatis per kegiatan dari halaman admin.

## Langkah 3 — Pertama kali masuk

1. Buka `admin.html`, lalu login dengan `admin` dan password awal.
2. Buka tab **Pengaturan**:
   - Ganti password.
   - Isi nama organisasi dan baris kedua kop.
   - URL logo, mis. `https://USERNAME.github.io/daftar-hadir-aipvogi/assets/logo.png`
3. Kembali ke tab **Kegiatan**, buat kegiatan uji coba, isi sendiri dari HP, lalu coba **Unduh PDF**.

## Pemakaian sehari-hari

1. **Buat kegiatan.** QR dan link langsung muncul. Bagikan lewat WA, Zoom chat, atau tayangkan QR-nya di layar.
2. Peserta mengisi data dan menandatangani di layar HP.
3. Pantau lewat **Peserta**. Di sana juga ada pencarian dan **Unduh CSV**.
4. Selesai kegiatan, klik **Tutup** lalu **Unduh PDF**.

## Mengelola admin

- **Tambah admin**: di editor Apps Script, ubah `username`/`nama` di fungsi `tambahAdminManual`, klik Run, lalu lihat password di log.
- **Lupa password**: ubah `username` di fungsi `resetPasswordManual`, klik Run, lalu lihat password baru di log.

## Keamanan

- URL Apps Script terlihat publik, dan itu wajar. Tanpa login, siapa pun hanya bisa **membaca nama/jadwal satu kegiatan** (kalau tahu ID-nya) dan **mengisi daftar hadir yang sedang dibuka**.
- Semua fungsi admin memerlukan login. Password disimpan sebagai hash bergaram (SHA-256), bukan teks asli. Sesi berlaku 6 jam, dan login dikunci 15 menit setelah 5 kali salah.
- Ada jebakan bot, penolakan nama ganda, validasi tanda tangan, dan pencegahan formula injection di Sheet.
- **Jangan** bagikan Google Sheet maupun folder tanda tangan dengan opsi "siapa saja yang memiliki link". Data berisi NIP/NIK, HP, dan tanda tangan, yang termasuk data pribadi (UU PDP).

## Jika ada masalah

| Gejala | Solusi |
|---|---|
| "URL Apps Script belum diisi di config.js" | Edit `config.js` lalu tempel URL `/exec`. |
| "Respons server tidak valid" | Deploy ulang Web app dengan akses **Anyone**. Pastikan memakai URL `/exec`, bukan `/dev`. |
| "Sheet … tidak ada" | Jalankan `setup()` di editor Apps Script. |
| QR tidak muncul | Pustaka QR dimuat dari internet (jsDelivr). Muat ulang halaman; link tetap bisa disalin. |
| Logo tidak tampil di PDF | Pastikan URL logo bisa dibuka publik dan berformat PNG/JPG. |
| PDF lama dibuat | Normal untuk peserta ratusan (memuat semua tanda tangan). Tunggu hingga selesai. |
