#!/usr/bin/env node
// Aquece o cache IMDb (OMDb) -> Supabase omdb_cache do OpenTv.
// Consome a MESMA cota OMDb dos clientes (100 req/h e 1000/dia por chave).
// Uso: node tools/warm-omdb.mjs [--limit 200] [--gap-ms 18000] [--dry-run]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : d; };
const LIMIT = argOf('limit', Infinity);
const GAP = argOf('gap-ms', 18000);
const DRY = argv.includes('--dry-run');

const cfg = readFileSync(join(ROOT, 'js', 'config.js'), 'utf8');
const KEYS = JSON.parse((cfg.match(/OMDB_API_KEYS:\s*(\[[^\]]*\])/) || [])[1] || '[]').filter(Boolean);
if (!KEYS.length) { console.error('OMDB_API_KEYS vazia em js/config.js'); process.exit(1); }
const sc = readFileSync(join(ROOT, 'js', 'supabase-client.js'), 'utf8');
const ANON = (sc.match(/sb_publishable_[A-Za-z0-9_]+/) || [''])[0];
if (!ANON) { console.error('anon key não encontrada em js/supabase-client.js'); process.exit(1); }
const SUPA = 'https://figvurwbnocrzoupvtgs.supabase.co';
const HDR = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };

const XT = 'https://telefunplay.xyz/player_api.php?username=' + encodeURIComponent('TurboBrasil@2026') +
    '&password=' + encodeURIComponent('@27101992');

const STATE_FILE = join(ROOT, 'tools', '.warm-state.json');
let state = { date: '', keys: {} };
if (existsSync(STATE_FILE)) { try { state = JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch (e) {} }
const today = new Date().toISOString().slice(0, 10);
if (state.date !== today) state = { date: today, keys: {} };
function saveState() { try { writeFileSync(STATE_FILE, JSON.stringify(state)); } catch (e) {} }
function kst(k) { if (!state.keys[k]) state.keys[k] = { used: 0, last: 0, pauseUntil: 0, fails: 0 }; return state.keys[k]; }

function pickKey() {
    const now = Date.now();
    let best = null;
    for (const k of KEYS) {
        const s = kst(k);
        if (s.used >= 1000 || s.fails >= 2 || s.pauseUntil > now) continue;
        if (now - s.last < 36000) continue;
        if (!best || s.used < kst(best).used) best = k;
    }
    return best;
}
function nextReadyMs() {
    const now = Date.now();
    let ms = 36000;
    for (const k of KEYS) {
        const s = kst(k);
        if (s.used >= 1000 || s.fails >= 2) continue;
        ms = Math.min(ms, Math.max(s.pauseUntil - now, s.last + 36000 - now, 500));
    }
    return Math.max(ms, 500);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function cleanTitle(name) {
    let t = String(name || '');
    t = t.replace(/\s*\((19|20)\d{2}\)\s*$/, '');
    t = t.replace(/\b(4K|UHD|UHD 4K|FHD|FULLHD|HD|SD|3D|IMAX|LEG(?:ENDADO)?|DUB(?:LADO)?|DUAL?\s?[ÝA]UDIO|DUO?\s?[ÝA]UDIO|REMASTER\w*|EXTEND\w*|CINEMA|EXCLUSIVO)\b/gi, ' ');
    t = t.replace(/\s*[-–|]\s*(4K|HD|FHD|LEG|DUB)\s*$/i, ' ');
    t = t.replace(/\s{2,}/g, ' ').trim();
    return t || String(name || '');
}

async function catalog() {
    const out = [];
    for (const act of ['get_vod_streams', 'get_series']) {
        const r = await fetch(XT + '&action=' + act);
        if (!r.ok) throw new Error(act + ' HTTP ' + r.status);
        const arr = await r.json();
        const type = act === 'get_series' ? 'series' : 'movie';
        for (const it of arr) {
            const title = String(it.name || it.title || '');
            if (!title) continue;
            const yr = (it.year && String(it.year) !== '0' && Number(it.year) > 1900) ? String(it.year) : '';
            out.push({ key: 't|' + title + '|' + yr + '|' + (type === 'series' ? 'series' : ''), title, yr, type });
        }
    }
    return out;
}

async function remoteExisting(keys) {
    const set = new Set();
    for (let i = 0; i < keys.length; i += 20) {
        const chunk = keys.slice(i, i + 20);
        const list = '(' + chunk.map(k => '"' + k.replace(/"/g, "'") + '"').join(',') + ')';
        const res = await fetch(SUPA + '/rest/v1/omdb_cache?select=key&key=in.' + encodeURIComponent(list),
            { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } });
        if (!res.ok) {
            console.error('SELECT falhou (HTTP ' + res.status + '). Rode supabase/omdb-cache.sql no Supabase SQL Editor.');
            process.exit(1);
        }
        const rows = await res.json();
        for (const row of rows) set.add(row.key);
    }
    return set;
}

async function put(key, data) {
    const res = await fetch(SUPA + '/rest/v1/omdb_cache?on_conflict=key', {
        method: 'POST',
        headers: { ...HDR, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ key, data, not_found: !data, updated_at: new Date().toISOString() })
    });
    if (!res.ok) throw new Error('upsert HTTP ' + res.status);
}

async function omdbQuery(item, apiKey) {
    const clean = cleanTitle(item.title);
    const tries = [];
    if (clean !== item.title && item.yr) tries.push({ t: clean, y: item.yr });
    tries.push({ t: clean, y: item.yr });
    if (item.yr) tries.push({ t: clean, y: '' });
    if (clean !== item.title) tries.push({ t: item.title, y: '' });
    for (const a of tries) {
        const p = new URLSearchParams({ apikey: apiKey, t: a.t.replace(/\s*\(\d{4}\)\s*$/, '') });
        if (a.y) p.set('y', a.y);
        if (item.type === 'series') p.set('type', 'series');
        const res = await fetch('https://www.omdbapi.com/?' + p.toString());
        const j = await res.json();
        if (j && j.Response === 'False' && /limit|quota|exceed/i.test(j.Error || '')) return { quota: true };
        if (j && j.Response === 'True') return { data: j };
    }
    return { data: null };
}

async function main() {
    log('catálogo…');
    const items = await catalog();
    log(items.length + ' títulos | chaves OMDb: ' + KEYS.length + (DRY ? ' | DRY-RUN' : ''));
    const existing = await remoteExisting(items.map(i => i.key));
    log(existing.size + ' já no cache remoto');
    const pending = items.filter(i => !existing.has(i.key));
    log(pending.length + ' para buscar');

    let hits = 0, nf = 0, done = 0, idx = 0;
    while (idx < pending.length && done < LIMIT) {
        const apiKey = pickKey();
        if (!apiKey) {
            const ms = nextReadyMs();
            log('aguardando janela OMDb: ' + Math.round(ms / 1000) + 's (fila ' + (pending.length - idx) + ')');
            await sleep(ms);
            continue;
        }
        const item = pending[idx];
        if (DRY) { idx++; done++; continue; }
        let out;
        try { out = await omdbQuery(item, apiKey); }
        catch (e) { await sleep(3000); continue; }
        const s = kst(apiKey);
        if (out.quota) {
            s.fails++;
            if (s.fails === 1) s.pauseUntil = Date.now() + 61 * 60 * 1000;
            saveState();
            log('cota atingida na chave ' + apiKey.slice(0, 4) + '… (fails ' + s.fails + ')');
            await sleep(5000);
            continue;
        }
        try { await put(item.key, out.data); }
        catch (e) { log('upsert falhou: ' + e.message); await sleep(5000); continue; }
        s.used++; s.last = Date.now(); saveState();
        if (out.data) hits++; else nf++;
        idx++; done++;
        if (done % 25 === 0) {
            log('ok=' + hits + ' notfound=' + nf + ' | fila=' + (pending.length - idx) +
                ' | chave ' + apiKey.slice(0, 4) + ' usada ' + s.used + '/1000');
        }
        await sleep(GAP);
    }
    log('fim: ok=' + hits + ' notfound=' + nf + ' processados=' + done + ' restantes=' + (pending.length - idx));
}

main().catch(e => { console.error(e); process.exit(1); });
