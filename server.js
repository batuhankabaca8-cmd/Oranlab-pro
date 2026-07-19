const express = require('express');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = __dirname;
const packedDb = path.join(dataDir, 'oranlab.db.gz');
const runtimeDb = process.env.ORANLAB_DB_PATH || path.join('/tmp', 'oranlab.db');

// HTML, CSS, JavaScript ve logo dosyalarını doğrudan yayınla.
// Bu satır API rotalarından önce olmalı; aksi hâlde CSS/JS istekleri index.html döndürür.
app.use(express.static(__dirname, {
  index: false,
  maxAge: 0,
  etag: false,
  setHeaders(res, filePath) {
    if (/\.(?:html|js|css)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  },
}));

async function extractDatabase() {
  if (fs.existsSync(runtimeDb) && fs.statSync(runtimeDb).size > 1024 * 1024) return;

  fs.mkdirSync(path.dirname(runtimeDb), { recursive: true });
  const tempDb = `${runtimeDb}.partial`;
  if (fs.existsSync(tempDb)) fs.unlinkSync(tempDb);

  const parts = fs.readdirSync(dataDir)
    .filter((name) => /^oranlab\.db\.gz\.part\d+$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (!fs.existsSync(packedDb) && !parts.length) {
    throw new Error('Sıkıştırılmış veritabanı veya parçaları bulunamadı.');
  }

  const gunzip = zlib.createGunzip();
  const output = fs.createWriteStream(tempDb);
  gunzip.pipe(output);

  const feedFile = (filePath) => new Promise((resolve, reject) => {
    const input = fs.createReadStream(filePath);
    input.on('error', reject);
    input.on('end', resolve);
    input.pipe(gunzip, { end: false });
  });

  try {
    if (fs.existsSync(packedDb)) {
      await feedFile(packedDb);
    } else {
      for (const name of parts) {
        console.log(`Veritabanı parçası açılıyor: ${name}`);
        await feedFile(path.join(dataDir, name));
      }
    }

    gunzip.end();
    await new Promise((resolve, reject) => {
      output.on('finish', resolve);
      output.on('error', reject);
      gunzip.on('error', reject);
    });

    if (fs.statSync(tempDb).size < 50 * 1024 * 1024) {
      throw new Error('Açılan veritabanı beklenenden küçük.');
    }
    fs.renameSync(tempDb, runtimeDb);
    console.log(`Veritabanı hazır: ${runtimeDb}`);
  } catch (error) {
    if (fs.existsSync(tempDb)) fs.unlinkSync(tempDb);
    throw error;
  }
}

let db;

function number(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}
function score(value) {
  const match = String(value || '').match(/(\d+)\s*[-:]\s*(\d+)/);
  return match ? [Number(match[1]), Number(match[2])] : null;
}
function percentage(value, total) { return total ? Math.round((value / total) * 100) : 0; }
function average(value, total) { return total ? Number((value / total).toFixed(2)) : 0; }
function similarity(row, targets, tolerance, barrier) {
  const keys = ['ms1', 'msx', 'ms2'];
  const used = keys.filter((key) => targets[key] !== null && row[key] !== null);
  let scoreValue = 100;
  if (used.length) {
    const avg = used.reduce((sum, key) => sum + Math.abs(row[key] - targets[key]) / Math.max(targets[key], 0.01), 0) / used.length;
    scoreValue = Math.max(0, Math.round((1 - Math.min(avg / Math.max(tolerance * 2, 0.08), 1)) * 100));
  }
  if (barrier && String(row.barrier || '').trim() !== barrier) scoreValue = Math.max(0, scoreValue - 8);
  return scoreValue;
}
function topScores(scoreMap, total) {
  return [...scoreMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3)
    .map(([label,count])=>({ score: label, count, percentage: percentage(count,total) }));
}

app.get('/api/status', (_req, res) => {
  const count = db.prepare('SELECT COUNT(*) AS count FROM matches').get().count;
  const years = db.prepare(`SELECT DISTINCT CAST(year AS INTEGER) AS year FROM matches WHERE CAST(year AS INTEGER) BETWEEN 1900 AND 2100 ORDER BY year DESC`).all().map((row) => row.year);
  res.json({ ok: true, version: '5.0-mobile', records: count, years });
});

app.get('/api/search', (req, res) => {
  try {
    const targets = { ms1: number(req.query.ms1), msx: number(req.query.msx), ms2: number(req.query.ms2) };
    const barrier = String(req.query.barem || '').trim();
    const tolerance = 0.05;
    const displayLimit = 100;
    const selectedYear = Number.parseInt(String(req.query.year || ''), 10);
    const hasYear = Number.isInteger(selectedYear) && selectedYear >= 1900 && selectedYear <= 2100;
    if (Object.values(targets).every((v) => v === null) && !barrier) return res.status(400).json({ error: 'En az bir arama alanı doldurulmalı.' });

    const clauses = []; const params = {};
    for (const key of ['ms1', 'msx', 'ms2']) {
      if (targets[key] === null) continue;
      clauses.push(`${key} BETWEEN @${key}Min AND @${key}Max`);
      params[`${key}Min`] = targets[key] - tolerance;
      params[`${key}Max`] = targets[key] + tolerance;
    }
    if (barrier) {
      clauses.push('TRIM(barrier) LIKE @barrier');
      params.barrier = `%${barrier}%`;
    }
    if (hasYear) {
      clauses.push('CAST(year AS INTEGER) = @selectedYear');
      params.selectedYear = selectedYear;
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) AS count FROM matches ${where}`).get(params).count;
    const sampleLimit = Math.min(Math.max(displayLimit * 30, 5000), 25000);
    const sample = db.prepare(`SELECT id,year,league,match_time,home,away,full_score,half_score,ms1,msx,ms2,barrier FROM matches ${where} LIMIT ${sampleLimit}`).all(params);
    const ranked = sample.map((row) => ({ ...row, similarity: similarity(row, targets, tolerance, barrier) }))
      .sort((a, b) => b.similarity - a.similarity || b.id - a.id);
    const rows = ranked.slice(0, displayLimit);

    let home=0, draw=0, away=0, iy05=0, ms15=0, ms25=0, kg=0, homeGoal=0, awayGoal=0;
    const goalBands={low:0,two:0,three:0,high:0}; const leagueMap=new Map();
    let valid=0, validHalf=0, totalGoals=0, totalHalfGoals=0;
    const scoreMap = new Map();
    for (const row of sample) {
      const fs=score(row.full_score); const hs=score(row.half_score);
      if (!fs) continue;
      valid++; const goals=fs[0]+fs[1]; totalGoals += goals;
      if(goals<=1) goalBands.low++; else if(goals===2) goalBands.two++; else if(goals===3) goalBands.three++; else goalBands.high++;
      const leagueName=String(row.league||'Bilinmeyen Lig').trim()||'Bilinmeyen Lig'; leagueMap.set(leagueName,(leagueMap.get(leagueName)||0)+1);
      const scoreLabel=`${fs[0]}-${fs[1]}`; scoreMap.set(scoreLabel,(scoreMap.get(scoreLabel)||0)+1);
      if (fs[0]>fs[1]) home++; else if (fs[0]===fs[1]) draw++; else away++;
      if (goals>1) ms15++; if (goals>2) ms25++;
      if (fs[0]>0 && fs[1]>0) kg++; if (fs[0]>0) homeGoal++; if (fs[1]>0) awayGoal++;
      if (hs) { validHalf++; totalHalfGoals += hs[0]+hs[1]; if (hs[0]+hs[1]>0) iy05++; }
    }
    const stats = {
      ms1:percentage(home,valid), msx:percentage(draw,valid), ms2:percentage(away,valid),
      iy05:percentage(iy05,validHalf), ms15:percentage(ms15,valid), ms25:percentage(ms25,valid), kg:percentage(kg,valid),
      homeGoal:percentage(homeGoal,valid), awayGoal:percentage(awayGoal,valid),
      avgGoals:average(totalGoals,valid), avgHalfGoals:average(totalHalfGoals,validHalf)
    };
    const goalDistribution={low:percentage(goalBands.low,valid),two:percentage(goalBands.two,valid),three:percentage(goalBands.three,valid),high:percentage(goalBands.high,valid)};
    const topLeagues=[...leagueMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([league,count])=>({league,count,percentage:percentage(count,valid)}));
    const top = Math.max(stats.ms1, stats.msx, stats.ms2, stats.iy05, stats.ms15, stats.ms25, stats.kg);
    const confidence = Math.min(99, Math.round((Math.min(valid, 1000) / 1000 * 35) + (top * .65)));
    res.json({ total, shown:rows.length, sampleSize:sample.length, rows, stats, topScores:topScores(scoreMap,valid), confidence, goalDistribution, topLeagues });
  } catch (error) {
    console.error(error); res.status(500).json({ error: 'Arama sırasında bir hata oluştu.' });
  }
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

async function startServer() {
  try {
    await extractDatabase();
    db = new Database(runtimeDb, { readonly: true });
    db.pragma('query_only = ON');
    app.listen(PORT, '0.0.0.0', () => console.log(`ORANLAB PRO Mobile v4.8 http://0.0.0.0:${PORT}`));
  } catch (error) {
    console.error('Başlatma hatası:', error);
    process.exit(1);
  }
}

startServer();
