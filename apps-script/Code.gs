/**
 * Backend kuesioner "Persepsi pengguna terhadap merek skincare"
 * - Menerima data dari index.html (POST, JSON)
 * - Menyimpan 1 baris per responden ke Google Spreadsheet
 * - Mengirim email notifikasi tiap ada responden baru
 *
 * Cara pasang: lihat README.md (ringkasnya: buka spreadsheet ->
 * Extensions > Apps Script -> tempel file ini -> jalankan setup() ->
 * Deploy > New deployment > Web app).
 */

var CONFIG = {
  EMAIL: 'devitaasari20@gmail.com',   // penerima notifikasi
  SHEET_NAME: 'Responses',            // nama sheet tujuan (dibuat otomatis)
  SPREADSHEET_ID: '',                 // kosongkan jika script dibuat dari dalam spreadsheet
  TIMEZONE: 'Asia/Jakarta',
  BRANDS: ['Skintific', 'Somethinc', 'Avoskin']
};

// Urutan butir harus sama dengan index.html
var DIMENSIONS = {
  BA: ['BA1', 'BA2', 'BA3', 'BA4'],   // Brand Awareness
  AS: ['AS1', 'AS2', 'AS3', 'AS4'],   // Brand Association
  PQ: ['PQ1', 'PQ2', 'PQ3', 'PQ4'],   // Perceived Quality
  BL: ['BL1', 'BL2', 'BL3', 'BL4']    // Brand Loyalty
};
var ITEM_CODES = [].concat(DIMENSIONS.BA, DIMENSIONS.AS, DIMENSIONS.PQ, DIMENSIONS.BL, ['AC']);

var PROFILE_LABELS = {
  P1: 'Jenis kelamin',
  P2: 'Pendidikan terakhir',
  P3: 'Pekerjaan',
  P4: 'Pengeluaran skincare per bulan',
  P5: 'Lama memakai merek',
  P6: 'Sumber pertama tahu merek'
};
var PROFILE_CODES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];

var HEADERS = ['Timestamp', 'ID', 'Nama', 'Usia 17+', 'Domisili Indonesia', 'Persetujuan', 'Merek', 'Durasi (detik)']
  .concat(ITEM_CODES)
  .concat(['Lolos cek perhatian (AC=4)', 'Mean BA', 'Mean AS', 'Mean PQ', 'Mean BL'])
  .concat(PROFILE_CODES.map(function (c) { return c + ' - ' + PROFILE_LABELS[c]; }));


/* ============================ ENDPOINT ============================ */

function doGet() {
  return json_({ status: 'ok', message: 'Survey endpoint aktif' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json_({ status: 'error', message: 'Server sibuk, coba lagi' });
  }

  try {
    var raw = e && e.postData && e.postData.contents;
    if (!raw) return json_({ status: 'error', message: 'Data kosong' });

    var d = JSON.parse(raw);

    // Honeypot: bot mengisi kolom tersembunyi -> abaikan tanpa menyimpan
    if (d.hp) return json_({ status: 'ok' });

    var problem = validate_(d);
    if (problem) return json_({ status: 'error', message: problem });

    var sheet = getSheet_();

    // Anti data ganda (kirim ulang karena jaringan)
    if (isDuplicate_(sheet, d.id)) return json_({ status: 'ok', duplicate: true });

    sheet.appendRow(buildRow_(d));
    SpreadsheetApp.flush();

    var total = sheet.getLastRow() - 1;
    try {
      notify_(d, total);
    } catch (mailErr) {
      // Gagal kirim email tidak boleh menghilangkan data responden
      console.error('Email gagal: ' + mailErr);
    }

    return json_({ status: 'ok' });
  } catch (ex) {
    console.error(ex);
    return json_({ status: 'error', message: 'Terjadi kesalahan di server' });
  } finally {
    lock.releaseLock();
  }
}


/* ============================ VALIDASI ============================ */

function validate_(d) {
  if (!d || typeof d !== 'object') return 'Format data salah';
  if (typeof d.id !== 'string' || d.id.length < 8 || d.id.length > 64) return 'ID tidak valid';
  if (!d.nama || String(d.nama).trim() === '') return 'Nama kosong';
  if (d.usia17 !== 'Ya') return 'Responden harus berusia 17 tahun ke atas';
  if (d.domisili !== 'Ya') return 'Responden harus berdomisili di Indonesia';
  if (d.consent !== true) return 'Persetujuan belum diberikan';
  if (CONFIG.BRANDS.indexOf(d.merek) === -1) return 'Merek tidak valid';
  if (!d.items || typeof d.items !== 'object') return 'Jawaban belum lengkap';

  for (var i = 0; i < ITEM_CODES.length; i++) {
    var v = d.items[ITEM_CODES[i]];
    if (typeof v !== 'number' || v % 1 !== 0 || v < 1 || v > 5) {
      return 'Jawaban ' + ITEM_CODES[i] + ' tidak valid';
    }
  }
  if (!d.profil || typeof d.profil !== 'object') return 'Profil belum lengkap';
  for (var j = 0; j < PROFILE_CODES.length; j++) {
    if (!d.profil[PROFILE_CODES[j]]) return 'Profil ' + PROFILE_CODES[j] + ' kosong';
  }
  return '';
}


/* ============================ SPREADSHEET ============================ */

function getSpreadsheet_() {
  if (CONFIG.SPREADSHEET_ID) return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Isi CONFIG.SPREADSHEET_ID atau buat script dari dalam spreadsheet.');
  return ss;
}

function getSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
      .setFontWeight('bold')
      .setBackground('#FDEBF1')
      .setWrap(true)
      .setVerticalAlignment('middle');
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(3);
  }
  return sheet;
}

function isDuplicate_(sheet, id) {
  if (sheet.getLastRow() < 2) return false;
  var hit = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1)
    .createTextFinder(id).matchEntireCell(true).findNext();
  return !!hit;
}

// Cegah formula injection: teks yang diawali = + - @ diberi tanda petik
function safe_(v) {
  var t = String(v == null ? '' : v).trim().slice(0, 200);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}

function mean_(codes, items) {
  var sum = 0;
  codes.forEach(function (c) { sum += items[c]; });
  return Math.round((sum / codes.length) * 100) / 100;
}

function buildRow_(d) {
  var ts = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  var durasi = Number(d.durasi);
  if (!isFinite(durasi) || durasi < 0) durasi = '';

  var row = [ts, d.id, safe_(d.nama), d.usia17, d.domisili, 'Ya', d.merek, durasi];

  ITEM_CODES.forEach(function (c) { row.push(d.items[c]); });

  row.push(d.items.AC === 4 ? 'Ya' : 'Tidak');
  row.push(mean_(DIMENSIONS.BA, d.items));
  row.push(mean_(DIMENSIONS.AS, d.items));
  row.push(mean_(DIMENSIONS.PQ, d.items));
  row.push(mean_(DIMENSIONS.BL, d.items));

  PROFILE_CODES.forEach(function (c) { row.push(safe_(d.profil[c])); });
  return row;
}


/* ============================ EMAIL ============================ */

function notify_(d, total) {
  var ss = getSpreadsheet_();
  var when = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd MMM yyyy HH:mm') + ' WIB';
  var nama = String(d.nama).trim().slice(0, 80);
  var ac = d.items.AC === 4 ? 'lolos' : 'TIDAK lolos (cek jawabannya)';

  var body = [
    'Ada responden baru yang mengisi kuesioner.',
    '',
    'Responden ke-' + total,
    'Nama      : ' + nama,
    'Merek     : ' + d.merek,
    'Waktu     : ' + when,
    'Durasi    : ' + (Number(d.durasi) ? Math.round(Number(d.durasi) / 60 * 10) / 10 + ' menit' : '-'),
    'Cek perhatian: ' + ac,
    '',
    'Rata-rata skor (1-5):',
    '  Brand Awareness     : ' + mean_(DIMENSIONS.BA, d.items),
    '  Brand Association   : ' + mean_(DIMENSIONS.AS, d.items),
    '  Perceived Quality   : ' + mean_(DIMENSIONS.PQ, d.items),
    '  Brand Loyalty       : ' + mean_(DIMENSIONS.BL, d.items),
    '',
    'Buka spreadsheet: ' + ss.getUrl()
  ].join('\n');

  MailApp.sendEmail({
    to: CONFIG.EMAIL,
    subject: '[Kuesioner Skincare] Responden baru #' + total + ': ' + nama + ' (' + d.merek + ')',
    body: body,
    name: 'Kuesioner Skincare'
  });
}


/* ============================ UTIL & UJI ============================ */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * JALANKAN SEKALI dari editor (pilih "setup" lalu Run).
 * Membuat sheet + header dan memicu izin akses spreadsheet & email.
 */
function setup() {
  var sheet = getSheet_();
  MailApp.sendEmail(CONFIG.EMAIL, 'Tes setup kuesioner skincare',
    'Setup berhasil. Notifikasi responden baru akan dikirim ke email ini.\n' + getSpreadsheet_().getUrl());
  Logger.log('Sheet "' + sheet.getName() + '" siap. Email tes terkirim ke ' + CONFIG.EMAIL);
}

/**
 * Opsional: simulasi 1 responden untuk mengetes sheet + email tanpa membuka website.
 * Setelah tes, hapus baris tes di spreadsheet.
 */
function testSubmit() {
  var items = {};
  ITEM_CODES.forEach(function (c) { items[c] = 4; });
  var fake = {
    postData: {
      contents: JSON.stringify({
        id: 'test-' + new Date().getTime(),
        nama: 'TES - hapus baris ini',
        usia17: 'Ya', domisili: 'Ya', consent: true,
        merek: 'Skintific',
        items: items,
        profil: { P1: 'Perempuan', P2: 'Sarjana (S1)', P3: 'Karyawan swasta', P4: 'Rp100.000 \u2013 Rp300.000', P5: '3\u20136 bulan', P6: 'Media sosial (TikTok, Instagram, dll.)' },
        durasi: 240,
        hp: ''
      })
    }
  };
  Logger.log(doPost(fake).getContent());
}
