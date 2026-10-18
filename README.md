# Kuesioner Persepsi Pengguna terhadap Merek Skincare

## Struktur folder
```
skincare-survey/
├── index.html              <- website (deploy ke Vercel)
├── assets/logos/           <- taruh skintific.png, somethinc.png, avoskin.png
└── apps-script/Code.gs     <- di-copy ke Google Apps Script (bukan untuk di-deploy ke Vercel)
```

## A. Pasang Apps Script
1. Buka Google Spreadsheet kosong (akun devitaasari20@gmail.com).
2. Menu **Extensions > Apps Script**. Hapus isi default, tempel seluruh isi `apps-script/Code.gs`, klik Save.
3. Pilih fungsi **setup** di dropdown lalu klik **Run**. Setujui izin akses (Advanced > Go to project > Allow).
   Hasilnya: sheet `Responses` dibuat + 1 email tes masuk ke inbox.
4. **Deploy > New deployment > Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Klik Deploy, salin **Web app URL** (berakhiran `/exec`).
5. (Opsional) Jalankan **testSubmit** untuk simulasi 1 responden, lalu hapus baris tes di sheet.

## B. Sambungkan ke website
1. Buka `index.html`, cari `var SCRIPT_URL = 'PASTE_URL_WEB_APP_DI_SINI';` lalu ganti dengan URL `/exec` tadi.
2. Taruh 3 file logo di `assets/logos/` (lihat README di folder itu).
3. Commit + push ke GitHub. Vercel akan deploy otomatis.

## Catatan
- Jika Code.gs diedit setelah deploy: **Deploy > Manage deployments > Edit > Version: New version > Deploy** (URL tetap sama).
- Kuota email Gmail via Apps Script: sekitar 100 email/hari. Jika responden lebih banyak per hari, data tetap tersimpan, hanya email notifikasinya yang berhenti.
- Baris dengan kolom "Lolos cek perhatian" = Tidak bisa dipertimbangkan untuk dikeluarkan dari analisis.
