// Gera icones PNG (192/512 + maskable) do OpenTv programaticamente
const fs = require('fs');
const zlib = require('zlib');

function crc32(buf) {
    let table = crc32.table;
    if (!table) {
        table = crc32.table = new Int32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            table[n] = c;
        }
    }
    let crc = -1;
    for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
    return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
}

function makePng(size, W, H, draw) {
    const raw = Buffer.alloc((W * 3 + 1) * H);
    let o = 0;
    for (let y = 0; y < H; y++) {
        raw[o++] = 0; // filtro none
        for (let x = 0; x < W; x++) {
            const [r, g, b, a] = draw(x, y);
            raw[o++] = r; raw[o++] = g; raw[o++] = b;
        }
    }
    const ihdr = Buffer.alloc(12);
    ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
    ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

function icon(size, maskable) {
    const R = size, cx = R / 2;
    const radius = Math.round(R * 0.19);
    const inRound = (x, y) => {
        const r = radius;
        const nx = Math.min(Math.max(x, r), R - r), ny = Math.min(Math.max(y, r), R - r);
        const dx = x - nx, dy = y - ny;
        return dx * dx + dy * dy <= r * r || (x >= r && x <= R - r) || (y >= r && y <= R - r);
    };
    const tri = (x, y) => {
        // triângulo play branco
        const x0 = cx - R * 0.13, x1 = cx + R * 0.20, yTop = cx - R * 0.22, yBot = cx + R * 0.22;
        if (x < x0 || x > x1) return false;
        const t = (x - x0) / (x1 - x0);
        return y >= yTop + t * (cx - yTop) && y <= yBot - t * (yBot - cx);
    };
    return makePng(size, R, R, (x, y) => {
        if (maskable) {
            return tri(x, y) ? [255, 255, 255] : [229, 9, 20];
        }
        if (!inRound(x, y)) return [0, 0, 0]; // canto fora = preto (RGB sem alpha)
        return tri(x, y) ? [255, 255, 255] : [229, 9, 20];
    });
}

// RGB sem alpha: cantos pretos. Melhor usar RGBA... simplifico: geramos JPG-like? Nao - PNG RGB com cantos pretos fica feio.
// Vamos gerar RGBA (color type 6) para ter transparencia nos cantos.
function makePngRgba(W, H, draw) {
    const raw = Buffer.alloc((W * 4 + 1) * H);
    let o = 0;
    for (let y = 0; y < H; y++) {
        raw[o++] = 0;
        for (let x = 0; x < W; x++) {
            const [r, g, b, a] = draw(x, y);
            raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
        }
    }
    const ihdr = Buffer.alloc(12);
    ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
    ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

function iconRgba(size, maskable) {
    const R = size, cx = R / 2;
    const radius = Math.round(R * 0.19);
    const inRound = (x, y) => {
        const r = radius;
        const nx = Math.min(Math.max(x, r), R - r), ny = Math.min(Math.max(y, r), R - r);
        const dx = x - nx, dy = y - ny;
        return (x >= r && x <= R - r) || (y >= r && y <= R - r) || (dx * dx + dy * dy <= r * r);
    };
    const tri = (x, y) => {
        const x0 = cx - R * 0.13, x1 = cx + R * 0.20, yTop = cx - R * 0.22, yBot = cx + R * 0.22;
        if (x < x0 || x > x1) return false;
        const t = (x - x0) / (x1 - x0);
        return y >= yTop + t * (cx - yTop) && y <= yBot - t * (yBot - cx);
    };
    return makePngRgba(R, R, (x, y) => {
        if (!maskable && !inRound(x, y)) return [0, 0, 0, 0];
        return tri(x, y) ? [255, 255, 255, 255] : [229, 9, 20, 255];
    });
}

fs.writeFileSync('assets/images/icon-192.png', iconRgba(192, false));
fs.writeFileSync('assets/images/icon-512.png', iconRgba(512, false));
fs.writeFileSync('assets/images/icon-maskable-192.png', iconRgba(192, true));
fs.writeFileSync('assets/images/icon-maskable-512.png', iconRgba(512, true));
console.log('PNGs gerados:', fs.readdirSync('assets/images').filter(f => f.endsWith('.png')).join(', '));
