'use strict';
/* PDF Fusion — نسخة الويب (pdf-lib + pdf.js). كل المعالجة داخل الجهاز ولا يتم رفع أي ملف. */

/* <pure> */
var AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
function normDigits(s) {
  return String(s).replace(/[٠-٩]/g, function (d) { return String(AR_DIGITS.indexOf(d)); });
}
function parsePages(spec, total) {
  var s = normDigits(spec).replace(/\s*-\s*/g, '-');
  var out = [];
  var toks = s.split(/[,،;؛\s]+/).filter(Boolean);
  for (var t = 0; t < toks.length; t++) {
    var tok = toks[t];
    var parts = tok.split('-');
    if (parts.length > 2 || !/^\d+$/.test(parts[0])) throw new Error('قيمة غير صحيحة: ' + tok);
    var a = parseInt(parts[0], 10);
    var b = a;
    if (parts.length === 2) {
      if (parts[1] === '') b = total;
      else if (/^\d+$/.test(parts[1])) b = parseInt(parts[1], 10);
      else throw new Error('قيمة غير صحيحة: ' + tok);
    }
    if (a < 1 || a > total || b < 1 || b > total) {
      throw new Error('رقم الصفحة خارج النطاق (1-' + total + '): ' + tok);
    }
    if (a <= b) { for (var i = a; i <= b; i++) out.push(i - 1); }
    else { for (var j = a; j >= b; j--) out.push(j - 1); }
  }
  if (!out.length) throw new Error('اكتب أرقام الصفحات');
  return out;
}
function fmtSize(b) {
  var s = b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b >= 1024 ? Math.round(b / 1024) + ' KB' : b + ' B';
  return '\u2066' + s + '\u2069';
}
function cleanName(raw, def) {
  var s = String(raw || '').trim().replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]/g, '_').trim();
  return s || def;
}
function baseName(n) { return cleanName(String(n).replace(/\.[^.]+$/, ''), 'document'); }
function jpegInfo(b) {
  if (b.length < 4 || b[0] !== 0xFF || b[1] !== 0xD8) return null;
  var i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xFF) { i++; continue; }
    var m = b[i + 1];
    if (m === 0xFF) { i++; continue; }
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], comps: b[i + 9] };
    }
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
}
/* </pure> */

const WORKER_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const TOOLS = [
  { id: 'merge', title: 'دمج ملفات PDF', emoji: '🔗', c: '124,92,255', badge: '★ الأهم', sub: 'حدّد عدة ملفات ثم ادمجها في ملف واحد بالترتيب الذي تريده' },
  { id: 'split', title: 'تقسيم PDF', emoji: '✂️', c: '0,184,217', hint: 'قسّم الملف: كل صفحة لوحدها، أو كل عدد معيّن من الصفحات، أو بنطاقات تحددها.' },
  { id: 'extract', title: 'استخراج صفحات', emoji: '📑', c: '46,204,113', hint: 'استخرج صفحات محددة في ملف PDF جديد.' },
  { id: 'delete', title: 'حذف صفحات', emoji: '🗑️', c: '255,90,110', hint: 'احذف الصفحات غير المرغوبة واحتفظ بالباقي.' },
  { id: 'rotate', title: 'تدوير الصفحات', emoji: '🔄', c: '255,167,38', hint: 'دوّر كل الصفحات أو صفحات محددة.' },
  { id: 'reorder', title: 'ترتيب الصفحات', emoji: '↕️', c: '171,71,188', hint: 'أعد ترتيب صفحات الملف كما تريد.' },
  { id: 'img2pdf', title: 'صور إلى PDF', emoji: '🖼️', c: '41,182,246', hint: 'اختر صورة أو أكثر، رتّبها، وسيتم وضع كل صورة في صفحة داخل ملف PDF واحد.' },
  { id: 'pdf2img', title: 'PDF إلى صور', emoji: '📷', c: '38,166,154', hint: 'حوّل صفحات الملف إلى صور JPG أو PNG.' },
  { id: 'compress', title: 'ضغط PDF', emoji: '🗜️', c: '255,202,40', hint: 'قلّل حجم الملف بضغط الصور الموجودة بداخله مع بقاء النص كما هو.' },
  { id: 'watermark', title: 'علامة مائية', emoji: '💧', c: '66,165,245', hint: 'أضف علامة مائية قطرية على كل الصفحات (حروف إنجليزية وأرقام).' },
  { id: 'numbers', title: 'ترقيم الصفحات', emoji: '🔢', c: '236,64,122', hint: 'أضف رقم الصفحة أسفل كل صفحة.' },
  { id: 'text', title: 'استخراج النص', emoji: '📝', c: '141,110,99', hint: 'استخرج النص من الملف إلى ملف TXT.' },
  { id: 'info', title: 'خصائص الملف', emoji: 'ℹ️', c: '120,144,156', hint: 'اعرض وعدّل عنوان الملف والمؤلف والكلمات المفتاحية.' },
  { id: 'view', title: 'عرض PDF', emoji: '👁️', c: '92,107,192', hint: 'اقرأ أي ملف PDF مباشرة داخل التطبيق.' }
];
const TOOL_BY_ID = {};
TOOLS.forEach(function (t) { TOOL_BY_ID[t.id] = t; });

function lib() {
  if (!window.PDFLib) throw new Error('مكتبة PDF لم تُحمَّل. افتح التطبيق مرة وأنت متصل بالإنترنت.');
  return window.PDFLib;
}
function pdfjs() {
  if (!window.pdfjsLib) throw new Error('مكتبة العرض لم تُحمَّل. افتح التطبيق مرة وأنت متصل بالإنترنت.');
  return window.pdfjsLib;
}
function errText(e) {
  const m = (e && (e.message || String(e))) || 'خطأ غير معروف';
  if (e && (e.name === 'EncryptedPDFError' || e.name === 'PasswordException' || /encrypted/i.test(m))) {
    return 'الملف محمي بكلمة مرور.';
  }
  return m;
}
const canvasBlob = (c, type, q) => new Promise((res) => c.toBlob(res, type, q));
const pdfFile = (bytes, name) => new File([bytes], name, { type: 'application/pdf' });

/* ===== عمليات PDF (pdf-lib) ===== */

function stripLinks(doc) {
  const L = lib();
  doc.getPages().forEach((page) => {
    try {
      const annots = page.node.Annots();
      if (!annots) return;
      const keep = [];
      for (let i = 0; i < annots.size(); i++) {
        const d = annots.lookupMaybe(i, L.PDFDict);
        const st = d && d.get(L.PDFName.of('Subtype'));
        if (!(st && String(st) === '/Link')) keep.push(annots.get(i));
      }
      if (keep.length === annots.size()) return;
      if (keep.length) page.node.set(L.PDFName.of('Annots'), doc.context.obj(keep));
      else page.node.delete(L.PDFName.of('Annots'));
    } catch (e) { /* تجاهل */ }
  });
}

async function opMerge(items, prog) {
  const L = lib();
  const out = await L.PDFDocument.create();
  for (let i = 0; i < items.length; i++) {
    prog(`${i + 1} / ${items.length}`);
    const src = await L.PDFDocument.load(await items[i].file.arrayBuffer());
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  out.setProducer('PDF Fusion');
  out.setCreator('PDF Fusion');
  return out.save();
}

async function opSubset(file, idx) {
  const L = lib();
  const src = await L.PDFDocument.load(await file.arrayBuffer());
  stripLinks(src);
  const out = await L.PDFDocument.create();
  const pages = await out.copyPages(src, idx);
  pages.forEach((p) => out.addPage(p));
  out.setProducer('PDF Fusion');
  return out.save();
}

async function opSplit(file, groups, prog) {
  const L = lib();
  const src = await L.PDFDocument.load(await file.arrayBuffer());
  stripLinks(src);
  const outs = [];
  for (let k = 0; k < groups.length; k++) {
    prog(`${k + 1} / ${groups.length}`);
    const d = await L.PDFDocument.create();
    const pages = await d.copyPages(src, groups[k]);
    pages.forEach((p) => d.addPage(p));
    d.setProducer('PDF Fusion');
    outs.push(await d.save());
  }
  return outs;
}

async function opRotate(file, idx, deg) {
  const L = lib();
  const doc = await L.PDFDocument.load(await file.arrayBuffer());
  const pages = doc.getPages();
  const targets = idx || pages.map((_, i) => i);
  targets.forEach((i) => {
    const p = pages[i];
    p.setRotation(L.degrees((((p.getRotation().angle + deg) % 360) + 360) % 360));
  });
  return doc.save();
}

async function opNumbers(file, pos) {
  const L = lib();
  const doc = await L.PDFDocument.load(await file.arrayBuffer());
  const font = await doc.embedFont(L.StandardFonts.Helvetica);
  const pages = doc.getPages();
  const n = pages.length;
  pages.forEach((p, i) => {
    const width = p.getSize().width;
    const t = `${i + 1} / ${n}`;
    const tw = font.widthOfTextAtSize(t, 10);
    const x = pos === 0 ? 28 : pos === 2 ? width - 28 - tw : (width - tw) / 2;
    p.drawText(t, { x, y: 20, size: 10, font, color: L.rgb(0.15, 0.15, 0.15) });
  });
  return doc.save();
}

async function opWatermark(file, text) {
  if (!/^[\x20-\x7E]+$/.test(text)) throw new Error('العلامة المائية: حروف إنجليزية وأرقام ورموز عادية فقط');
  const L = lib();
  const doc = await L.PDFDocument.load(await file.arrayBuffer());
  const font = await doc.embedFont(L.StandardFonts.HelveticaBold);
  const unit = font.widthOfTextAtSize(text, 1);
  const ang = Math.PI / 4;
  doc.getPages().forEach((p) => {
    const sz = p.getSize();
    const fs = Math.min(96, (0.7 * Math.hypot(sz.width, sz.height)) / unit);
    const tw = unit * fs;
    p.drawText(text, {
      x: sz.width / 2 - (tw / 2) * Math.cos(ang),
      y: sz.height / 2 - (tw / 2) * Math.sin(ang),
      size: fs, font, color: L.rgb(0.5, 0.5, 0.5), opacity: 0.25, rotate: L.degrees(45)
    });
  });
  return doc.save();
}

async function toJpeg(file, maxSide, q) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('تعذر قراءة الصورة: ' + file.name));
      im.src = url;
    });
    let w = img.naturalWidth, h = img.naturalHeight;
    const m = Math.max(w, h);
    if (m > maxSide) { const r = maxSide / m; w = Math.max(1, Math.round(w * r)); h = Math.max(1, Math.round(h * r)); }
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, h);
    const blob = await canvasBlob(c, 'image/jpeg', q);
    c.width = c.height = 0;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
  } finally { URL.revokeObjectURL(url); }
}

async function opImages(files, a4, prog) {
  const L = lib();
  const doc = await L.PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    prog(`${i + 1} / ${files.length}`);
    const { bytes, w, h } = await toJpeg(files[i], 2200, 0.88);
    const img = await doc.embedJpg(bytes);
    let pw, ph;
    if (a4) { const land = w > h; pw = land ? 841.89 : 595.28; ph = land ? 595.28 : 841.89; }
    else { const s = 842 / Math.max(w, h); pw = w * s; ph = h * s; }
    const page = doc.addPage([pw, ph]);
    const k = Math.min(pw / w, ph / h), dw = w * k, dh = h * k;
    page.drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
  }
  doc.setProducer('PDF Fusion');
  return doc.save();
}

async function opCompress(file, maxSide, quality, prog) {
  const L = lib();
  const buf = await file.arrayBuffer();
  const doc = await L.PDFDocument.load(buf);
  const ctx = doc.context;
  const N = (s) => L.PDFName.of(s);
  const entries = ctx.enumerateIndirectObjects();
  let k = 0, changed = 0;
  for (const [ref, obj] of entries) {
    if (!(obj instanceof L.PDFRawStream)) continue;
    const d = obj.dict;
    const sub = d.get(N('Subtype'));
    if (!sub || String(sub) !== '/Image') continue;
    let f = d.get(N('Filter'));
    if (f instanceof L.PDFArray) { if (f.size() !== 1) continue; f = f.get(0); }
    if (!f || String(f) !== '/DCTDecode') continue;
    if (d.has(N('Mask'))) continue;
    const info = jpegInfo(obj.contents);
    if (!info || info.comps === 4) continue;
    k++;
    prog('صورة ' + k);
    try {
      const bmp = await createImageBitmap(new Blob([obj.contents], { type: 'image/jpeg' }));
      let w = bmp.width, h = bmp.height;
      const m = Math.max(w, h);
      if (m > maxSide) { const r = maxSide / m; w = Math.max(1, Math.round(w * r)); h = Math.max(1, Math.round(h * r)); }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
      g.drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();
      const blob = await canvasBlob(c, 'image/jpeg', quality);
      c.width = c.height = 0;
      const nb = new Uint8Array(await blob.arrayBuffer());
      if (nb.length >= obj.contents.length) continue;
      const nd = ctx.obj({ Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode' });
      const sm = d.get(N('SMask'));
      if (sm) nd.set(N('SMask'), sm);
      ctx.assign(ref, L.PDFRawStream.of(nd, nb));
      changed++;
    } catch (e) { /* تجاهل الصورة */ }
  }
  const out = await doc.save();
  return { bytes: out, before: buf.byteLength, after: out.length, changed };
}

async function opReadInfo(file) {
  const L = lib();
  const d = await L.PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
  return [d.getTitle() || '', d.getAuthor() || '', d.getSubject() || '', d.getKeywords() || ''];
}

async function opWriteInfo(file, v) {
  const L = lib();
  const d = await L.PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
  d.setTitle(v[0]);
  d.setAuthor(v[1]);
  d.setSubject(v[2]);
  d.setKeywords(v[3].split(/[,،]/).map((s) => s.trim()).filter(Boolean));
  return d.save();
}

/* ===== عمليات العرض (pdf.js) ===== */

async function openPdfjs(file) {
  const task = pdfjs().getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  return { task, pdf: await task.promise };
}

async function opPdf2Img(file, idx, png, scale, base, prog) {
  const { task, pdf } = await openPdfjs(file);
  const outs = [];
  const type = png ? 'image/png' : 'image/jpeg';
  try {
    for (let k = 0; k < idx.length; k++) {
      prog(`${k + 1} / ${idx.length}`);
      const page = await pdf.getPage(idx[k] + 1);
      const v1 = page.getViewport({ scale: 1 });
      let s = scale;
      const m = Math.max(v1.width, v1.height) * s;
      if (m > 3000) s = (s * 3000) / m;
      const vp = page.getViewport({ scale: s });
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.floor(vp.width));
      c.height = Math.max(1, Math.floor(vp.height));
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      const blob = await canvasBlob(c, type, 0.92);
      outs.push(new File([blob], `${base}_p${idx[k] + 1}.${png ? 'png' : 'jpg'}`, { type }));
      c.width = c.height = 0;
      page.cleanup();
    }
  } finally { await task.destroy(); }
  return outs;
}

async function opText(file) {
  const { task, pdf } = await openPdfjs(file);
  let out = '';
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      out += tc.items.map((it) => it.str + (it.hasEOL ? '\n' : '')).join('') + '\n\n';
      page.cleanup();
    }
  } finally { await task.destroy(); }
  return out.trim();
}

async function inspectPdf(file) {
  const pj = pdfjs();
  const buf = await file.arrayBuffer();
  let pages = 0, locked = false, thumb = null, task = null;
  try {
    task = pj.getDocument({ data: new Uint8Array(buf) });
    const doc = await task.promise;
    pages = doc.numPages;
    try {
      const p = await doc.getPage(1);
      const v0 = p.getViewport({ scale: 1 });
      const vp = p.getViewport({ scale: 140 / v0.width });
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(vp.width));
      c.height = Math.max(1, Math.ceil(vp.height));
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await p.render({ canvasContext: g, viewport: vp }).promise;
      thumb = c.toDataURL('image/jpeg', 0.7);
      p.cleanup();
    } catch (e) { /* بدون صورة مصغّرة */ }
  } catch (e) {
    if (e && e.name === 'PasswordException') locked = true;
  }
  try { if (task) await task.destroy(); } catch (e) { /* */ }
  return { id: ++uid, file, name: file.name, size: file.size, pages, locked, thumb };
}

async function renderPdfInto(container, bytes) {
  const pj = pdfjs();
  const task = pj.getDocument({ data: bytes });
  const pdf = await task.promise;
  const first = await pdf.getPage(1);
  const v1 = first.getViewport({ scale: 1 });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let queue = Promise.resolve();
  let dead = false;
  async function draw(i, holder) {
    if (holder.dataset.state) return;
    holder.dataset.state = 'q';
    queue = queue.then(async () => {
      if (dead || holder.dataset.state !== 'q') return;
      try {
        const page = await pdf.getPage(i + 1);
        const v0 = page.getViewport({ scale: 1 });
        const w = holder.clientWidth || 360;
        const vp = page.getViewport({ scale: (w * dpr) / v0.width });
        const c = document.createElement('canvas');
        c.width = Math.floor(vp.width);
        c.height = Math.floor(vp.height);
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        if (dead || holder.dataset.state !== 'q') { c.width = c.height = 0; return; }
        holder.style.aspectRatio = (v0.width / v0.height).toFixed(4);
        holder.replaceChildren(c);
        holder.dataset.state = 'done';
        page.cleanup();
      } catch (e) { holder.dataset.state = ''; }
    });
  }
  function free(holder) {
    if (!holder.dataset.state) return;
    holder.dataset.state = '';
    holder.replaceChildren();
  }
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      const i = Number(en.target.dataset.i);
      if (en.isIntersecting) draw(i, en.target); else free(en.target);
    });
  }, { rootMargin: '800px 0px' });
  for (let i = 0; i < pdf.numPages; i++) {
    const holder = h('div', { class: 'pg', 'data-i': i, style: 'aspect-ratio:' + (v1.width / v1.height).toFixed(4) });
    container.appendChild(holder);
    obs.observe(holder);
  }
  return () => { dead = true; obs.disconnect(); task.destroy(); };
}

/* ===== واجهة ===== */

let uid = 0;
let cleanups = [];
const state = { tool: null };

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    Object.keys(props).forEach((k) => {
      const v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    });
  }
  kids.flat().forEach((kid) => {
    if (kid == null || kid === false) return;
    el.appendChild(typeof kid === 'object' ? kid : document.createTextNode(String(kid)));
  });
  return el;
}
const panel = (...kids) => h('div', { class: 'panel' }, ...kids);
const note = (t, cls) => h('p', { class: 'note' + (cls ? ' ' + cls : '') }, t);
const lbl = (t) => h('div', { class: 'lbl' }, t);
const button = (text, onclick, cls) => h('button', { class: 'btn ' + (cls || ''), type: 'button', onclick }, text);

function field(label, value, opts) {
  const o = opts || {};
  const input = h('input', {
    type: o.type || 'text', value: value || '', autocomplete: 'off', autocapitalize: 'off',
    spellcheck: 'false', inputmode: o.inputmode
  });
  return { el: h('label', { class: 'fld' }, h('span', null, label), input), input, get: () => input.value, set: (v) => { input.value = v; } };
}

function pills(options, selected, onChange) {
  let sel = selected;
  const btns = options.map((o, i) => h('button', {
    class: 'pill' + (i === sel ? ' on' : ''), type: 'button',
    onclick: () => { sel = i; btns.forEach((b, j) => b.classList.toggle('on', j === sel)); if (onChange) onChange(i); }
  }, o));
  return { el: h('div', { class: 'pills' }, ...btns), get: () => sel };
}

function metaText(it) {
  if (it.locked) return '🔒 محمي بكلمة مرور • ' + fmtSize(it.size);
  if (!it.pages) return '⚠️ تعذر قراءة الملف • ' + fmtSize(it.size);
  return it.pages + ' صفحة • ' + fmtSize(it.size);
}
function thumbBox(it) {
  return h('div', { class: 'th' }, it.thumb ? h('img', { src: it.thumb, alt: '' }) : it.locked ? '🔒' : '📄');
}

async function shareFiles(files) {
  try {
    if (navigator.canShare && navigator.canShare({ files })) { await navigator.share({ files }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  files.forEach((f) => {
    const a = document.createElement('a');
    const u = URL.createObjectURL(f);
    a.href = u; a.download = f.name; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 120000);
  });
}

async function previewFile(file) {
  const ov = h('div', { class: 'ov' });
  const scroll = h('div', { class: 'scroll' });
  let destroy = null;
  const close = () => { try { if (destroy) destroy(); } catch (e) { /* */ } ov.remove(); document.body.classList.remove('lock'); };
  ov.append(h('div', { class: 'bar' }, h('button', { class: 'back', type: 'button', onclick: close }, '✕'), h('h2', null, file.name)), scroll);
  document.body.appendChild(ov);
  document.body.classList.add('lock');
  try { destroy = await renderPdfInto(scroll, new Uint8Array(await file.arrayBuffer())); }
  catch (e) { scroll.appendChild(note('⚠️ ' + errText(e), 'err')); }
}

function statusBox() {
  const el = h('div');
  let busy = false;
  const setBusy = (m) => el.replaceChildren(panel(h('div', { class: 'busy' }, h('div', { class: 'spin' }), h('span', null, 'جارٍ المعالجة… ' + (m || '')))));
  const api = {
    el,
    clear() { if (!busy) el.replaceChildren(); },
    done(r) {
      const files = r.files || [];
      const kids = [h('p', { class: 'note ok' }, r.msg)];
      if (files.length > 1) {
        kids.push(h('ul', { class: 'outs' }, ...files.slice(0, 8).map((f) => h('li', null, '• ' + f.name)),
          files.length > 8 ? h('li', null, '… و' + (files.length - 8) + ' ملفات أخرى') : null));
      }
      if (files.length) {
        const acts = [button('💾  حفظ / مشاركة', () => shareFiles(files), 'primary')];
        if (files.length === 1 && files[0].type === 'application/pdf') acts.push(button('👁️  معاينة', () => previewFile(files[0])));
        kids.push(h('div', { class: 'acts' }, ...acts));
        kids.push(note('من قائمة المشاركة اختر «حفظ في الملفات».'));
      }
      el.replaceChildren(panel(...kids));
    },
    fail(e) { el.replaceChildren(panel(h('p', { class: 'note err' }, '⚠️ ' + errText(e)))); },
    async run(fn) {
      if (busy) return;
      busy = true;
      setBusy('');
      try { api.done(await fn((m) => setBusy(m))); } catch (e) { api.fail(e); }
      busy = false;
    }
  };
  return api;
}

function pdfPicker(onPicked) {
  let current = null, loading = false;
  const input = h('input', { type: 'file', accept: 'application/pdf,.pdf', style: 'display:none' });
  const card = h('button', { class: 'panel', type: 'button', onclick: () => input.click() });
  function draw() {
    card.replaceChildren();
    if (loading) { card.appendChild(h('div', { class: 'busy' }, h('div', { class: 'spin' }), h('span', null, 'جارٍ فتح الملف…'))); return; }
    if (!current) { card.appendChild(h('b', null, '📂  اضغط هنا لاختيار ملف PDF')); return; }
    card.appendChild(h('div', { class: 'pickrow' }, thumbBox(current),
      h('div', { class: 'meta' }, h('b', null, current.name), h('small', { class: current.locked || !current.pages ? 'err' : '' }, metaText(current))),
      h('span', { style: 'color:var(--ac);font-weight:700' }, 'تغيير')));
  }
  input.addEventListener('change', async () => {
    const f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    loading = true; draw();
    try { current = await inspectPdf(f); } catch (e) { current = null; alert('تعذر فتح الملف: ' + errText(e)); }
    loading = false; draw();
    if (current) onPicked(current);
  });
  draw();
  return { el: h('div', null, input, card) };
}

function buildSingle(body, id, options) {
  const status = statusBox();
  const host = h('div', { class: 'stack' });
  const picker = pdfPicker((pdf) => {
    status.clear();
    host.replaceChildren();
    if (pdf.locked) { host.appendChild(panel(note('🔒 هذا الملف محمي بكلمة مرور. فك الحماية غير متاح في نسخة الويب حاليًا.', 'err'))); return; }
    if (!pdf.pages) { host.appendChild(panel(note('⚠️ تعذر قراءة هذا الملف (قد يكون تالفًا).', 'err'))); return; }
    options(host, pdf, status);
  });
  body.append(note(TOOL_BY_ID[id].hint, 'hint'), picker.el, host, status.el);
}

function itemRow(i, n, thumb, title, sub, bad, act) {
  return h('div', { class: 'item' },
    h('div', { class: 'idx' }, String(i + 1)), thumb,
    h('div', { class: 'meta' }, h('b', null, title), h('small', { class: bad ? 'err' : '' }, sub)),
    h('div', { class: 'ud' },
      h('button', { class: 'mini', type: 'button', disabled: i === 0, onclick: act.up }, '▲'),
      h('button', { class: 'mini', type: 'button', disabled: i === n - 1, onclick: act.down }, '▼')),
    h('button', { class: 'mini del', type: 'button', onclick: act.del }, '✕'));
}

function buildMerge(body) {
  let items = [];
  const status = statusBox();
  const nameF = field('اسم الملف الناتج', 'merged');
  const listEl = h('div', { class: 'list' });
  const emptyEl = panel(h('div', { class: 'big' }, '🔗'), note('اختر ملفين أو أكثر (تقدر تحدد عدة ملفات مرة واحدة)، ثم رتّبها بالأسهم ▲ ▼ وادمجها في ملف واحد.'));
  const sumEl = note('');
  const warnEl = note('', 'err');
  const loadEl = note('جارٍ فتح الملفات…', 'hidden');
  const input = h('input', { type: 'file', accept: 'application/pdf,.pdf', multiple: true, style: 'display:none' });
  const addBtn = button('➕  اختيار ملفات PDF', () => input.click(), 'primary');
  const sortBtn = button('ترتيب أ-ي', () => { items.sort((a, b) => a.name.localeCompare(b.name, 'ar')); redraw(); }, 'ghost hidden');
  const runBtn = button('🔗  دمج', run, 'primary');
  const tail = h('div', { class: 'stack hidden' }, sumEl, warnEl, nameF.el, runBtn);

  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const t = items[i]; items[i] = items[j]; items[j] = t;
    redraw();
  }
  function redraw() {
    const locked = items.filter((x) => x.locked).length;
    const bad = items.filter((x) => !x.locked && !x.pages).length;
    listEl.replaceChildren(...items.map((it, i) => itemRow(i, items.length, thumbBox(it), it.name, metaText(it), it.locked || !it.pages, {
      up: () => move(i, -1), down: () => move(i, 1), del: () => { items.splice(i, 1); status.clear(); redraw(); }
    })));
    sumEl.textContent = items.length ? `${items.length} ملف • ${items.reduce((s, x) => s + (x.pages > 0 ? x.pages : 0), 0)} صفحة • ${fmtSize(items.reduce((s, x) => s + x.size, 0))}` : '';
    warnEl.textContent = locked ? '🔒 يوجد ملف محمي بكلمة مرور — احذفه من القائمة.' : bad ? '⚠️ يوجد ملف تعذر قراءته — احذفه من القائمة.' : '';
    runBtn.disabled = !(items.length >= 2 && !locked && !bad);
    runBtn.textContent = `🔗  دمج ${items.length} ملفات`;
    addBtn.textContent = items.length ? '➕  إضافة المزيد' : '➕  اختيار ملفات PDF';
    sortBtn.classList.toggle('hidden', items.length < 2);
    emptyEl.classList.toggle('hidden', items.length > 0);
    tail.classList.toggle('hidden', items.length === 0);
  }
  function run() {
    const list = items.slice();
    const outName = cleanName(nameF.get(), 'merged') + '.pdf';
    status.run(async (prog) => {
      const bytes = await opMerge(list, prog);
      return { msg: `✅ تم دمج ${list.length} ملفات في ملف واحد (${fmtSize(bytes.length)})`, files: [pdfFile(bytes, outName)] };
    });
  }
  input.addEventListener('change', async () => {
    const fs = Array.from(input.files || []);
    input.value = '';
    if (!fs.length) return;
    loadEl.classList.remove('hidden');
    let failed = 0;
    for (const f of fs) { try { items.push(await inspectPdf(f)); } catch (e) { failed++; } }
    loadEl.classList.add('hidden');
    status.clear();
    redraw();
    if (failed) alert('تعذر فتح ' + failed + ' ملف');
  });
  redraw();
  body.append(input, h('div', { class: 'acts' }, addBtn, sortBtn), loadEl, emptyEl, listEl, tail, status.el);
}

function buildImages(body) {
  let items = [];
  let a4 = 1;
  const status = statusBox();
  const nameF = field('اسم الملف الناتج', 'images');
  const listEl = h('div', { class: 'list' });
  const emptyEl = panel(h('div', { class: 'big' }, '🖼️'), note('اختر صورة أو أكثر، رتّبها، وسيتم وضع كل صورة في صفحة داخل ملف PDF واحد.'));
  const input = h('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none' });
  const addBtn = button('➕  اختيار صور', () => input.click(), 'primary');
  const modePills = pills(['مطابق للصورة', 'A4'], 1, (i) => { a4 = i; });
  const runBtn = button('🖼️  إنشاء PDF', run, 'primary');
  const tail = h('div', { class: 'stack hidden' }, panel(lbl('حجم الصفحة'), modePills.el), nameF.el, runBtn);

  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const t = items[i]; items[i] = items[j]; items[j] = t;
    redraw();
  }
  function redraw() {
    listEl.replaceChildren(...items.map((it, i) => itemRow(i, items.length, h('div', { class: 'th' }, h('img', { src: it.url, alt: '' })), it.name, 'صورة ' + (i + 1), false, {
      up: () => move(i, -1), down: () => move(i, 1),
      del: () => { URL.revokeObjectURL(it.url); items.splice(i, 1); status.clear(); redraw(); }
    })));
    runBtn.textContent = `🖼️  إنشاء PDF من ${items.length} صورة`;
    addBtn.textContent = items.length ? '➕  إضافة المزيد' : '➕  اختيار صور';
    emptyEl.classList.toggle('hidden', items.length > 0);
    tail.classList.toggle('hidden', items.length === 0);
  }
  function run() {
    const files = items.map((x) => x.file);
    const outName = cleanName(nameF.get(), 'images') + '.pdf';
    const useA4 = a4 === 1;
    status.run(async (prog) => {
      const bytes = await opImages(files, useA4, prog);
      return { msg: `✅ تم إنشاء PDF من ${files.length} صورة (${fmtSize(bytes.length)})`, files: [pdfFile(bytes, outName)] };
    });
  }
  input.addEventListener('change', () => {
    const fs = Array.from(input.files || []);
    input.value = '';
    fs.forEach((f) => items.push({ id: ++uid, file: f, name: f.name, url: URL.createObjectURL(f) }));
    status.clear();
    redraw();
  });
  cleanups.push(() => items.forEach((x) => URL.revokeObjectURL(x.url)));
  redraw();
  body.append(input, addBtn, emptyEl, listEl, tail, status.el);
}

function buildViewer(body) {
  const host = h('div', { class: 'viewer' });
  let destroy = null;
  const picker = pdfPicker(async (pdf) => {
    if (destroy) { destroy(); destroy = null; }
    host.replaceChildren();
    if (pdf.locked || !pdf.pages) { host.appendChild(note(pdf.locked ? '🔒 الملف محمي بكلمة مرور.' : '⚠️ تعذر قراءة الملف.', 'err')); return; }
    try { destroy = await renderPdfInto(host, new Uint8Array(await pdf.file.arrayBuffer())); }
    catch (e) { host.appendChild(note('⚠️ ' + errText(e), 'err')); }
  });
  cleanups.push(() => { if (destroy) destroy(); });
  body.append(note(TOOL_BY_ID.view.hint, 'hint'), picker.el, host);
}

/* خيارات الأدوات ذات الملف الواحد */

function optSplit(host, pdf, status) {
  let mode = 0;
  const nF = field('عدد الصفحات في كل ملف', '2', { inputmode: 'numeric' });
  const rF = field('نطاقات، مثال: 1-3, 4-6, 9', '');
  const sync = () => { nF.el.classList.toggle('hidden', mode !== 1); rF.el.classList.toggle('hidden', mode !== 2); };
  const pl = pills(['كل صفحة', 'كل N صفحات', 'نطاقات'], 0, (i) => { mode = i; sync(); });
  sync();
  host.append(
    panel(lbl('طريقة التقسيم'), pl.el, nF.el, rF.el, note('عدد صفحات الملف: ' + pdf.pages)),
    button('✂️  تقسيم الآن', () => status.run(async (prog) => {
      const n = pdf.pages;
      let groups;
      if (mode === 0) groups = Array.from({ length: n }, (_, i) => [i]);
      else if (mode === 1) {
        const k = parseInt(normDigits(nF.get()), 10);
        if (!(k >= 1)) throw new Error('اكتب عددًا صحيحًا');
        groups = [];
        for (let i = 0; i < n; i += k) groups.push(Array.from({ length: Math.min(k, n - i) }, (_, j) => i + j));
      } else {
        groups = rF.get().split(/[,،;؛]+/).filter((s) => s.trim()).map((s) => parsePages(s, n));
        if (!groups.length) throw new Error('اكتب النطاقات');
      }
      const outs = await opSplit(pdf.file, groups, prog);
      const base = baseName(pdf.name);
      return { msg: `✅ تم إنشاء ${outs.length} ملف`, files: outs.map((b, i) => pdfFile(b, `${base}_${i + 1}.pdf`)) };
    }), 'primary')
  );
}

function optPages(id, host, pdf, status) {
  let angle = 0;
  const labels = {
    extract: 'الصفحات المطلوب استخراجها', delete: 'الصفحات المطلوب حذفها',
    rotate: 'الصفحات المراد تدويرها (فارغ = كل الصفحات)', reorder: 'الترتيب الجديد للصفحات'
  };
  const sF = field('مثال: 1-3, 5, 8-10', '');
  const kids = [lbl(labels[id]), sF.el];
  if (id === 'rotate') kids.push(pills(['90° يمين', '180°', '90° يسار'], 0, (i) => { angle = i; }).el);
  if (id === 'reorder') {
    kids.push(button('↕️  عكس ترتيب كل الصفحات', () => sF.set(pdf.pages + '-1'), 'ghost'));
    kids.push(note('اكتب الصفحات بالترتيب الجديد، مثال: 3, 1, 2 (يمكن تكرار صفحة أو تجاهل صفحات).'));
  }
  kids.push(note('عدد صفحات الملف: ' + pdf.pages));
  host.append(panel(...kids), button('✅  تنفيذ', () => status.run(async () => {
    const s = sF.get();
    const n = pdf.pages;
    const base = baseName(pdf.name);
    if (id === 'rotate') {
      const idx = s.trim() ? parsePages(s, n) : null;
      const deg = [90, 180, 270][angle];
      return { msg: '✅ تم تدوير الصفحات', files: [pdfFile(await opRotate(pdf.file, idx, deg), base + '_rotated.pdf')] };
    }
    if (id === 'delete') {
      const del = new Set(parsePages(s, n));
      const keep = [];
      for (let i = 0; i < n; i++) if (!del.has(i)) keep.push(i);
      if (!keep.length) throw new Error('لا يمكن حذف كل الصفحات');
      return { msg: `✅ تم حذف ${del.size} صفحة، المتبقي ${keep.length}`, files: [pdfFile(await opSubset(pdf.file, keep), base + '_edited.pdf')] };
    }
    const idx = parsePages(s, n);
    return {
      msg: id === 'extract' ? `✅ تم استخراج ${idx.length} صفحة` : `✅ تم ترتيب الصفحات (${idx.length} صفحة)`,
      files: [pdfFile(await opSubset(pdf.file, idx), base + (id === 'extract' ? '_extract.pdf' : '_reordered.pdf'))]
    };
  }), 'primary'));
}

function optPdf2Img(host, pdf, status) {
  let fmt = 0, q = 1;
  const sF = field('الصفحات (فارغ = كل الصفحات)', '');
  host.append(
    panel(lbl('صيغة الصورة'), pills(['JPG', 'PNG'], 0, (i) => { fmt = i; }).el,
      lbl('الجودة'), pills(['عادية', 'عالية', 'ممتازة'], 1, (i) => { q = i; }).el, sF.el),
    button('📷  تحويل إلى صور', () => status.run(async (prog) => {
      const s = sF.get();
      const idx = s.trim() ? parsePages(s, pdf.pages) : Array.from({ length: pdf.pages }, (_, i) => i);
      const files = await opPdf2Img(pdf.file, idx, fmt === 1, [1.3, 2, 3][q], baseName(pdf.name), prog);
      return { msg: `✅ تم تحويل ${files.length} صفحة إلى صور. اختر «حفظ الصور» من قائمة المشاركة لإضافتها للمعرض.`, files };
    }), 'primary')
  );
}

function optCompress(host, pdf, status) {
  let lvl = 1;
  host.append(
    panel(lbl('مستوى الضغط'), pills(['خفيف', 'متوسط', 'قوي'], 1, (i) => { lvl = i; }).el,
      note('يضغط الصور داخل الملف ويترك النص كما هو. الملفات النصية فقط غالبًا لا تنضغط أكثر.')),
    button('🗜️  ضغط الآن', () => status.run(async (prog) => {
      const r = await opCompress(pdf.file, [2400, 1800, 1200][lvl], [0.8, 0.62, 0.45][lvl], prog);
      if (!r.changed || r.after >= r.before) return { msg: 'ℹ️ لا يمكن تصغير هذا الملف أكثر (لا توجد صور قابلة للضغط).' };
      const pct = Math.round(((r.before - r.after) * 100) / r.before);
      return { msg: `✅ من ${fmtSize(r.before)} إلى ${fmtSize(r.after)} (توفير ${pct}%)`, files: [pdfFile(r.bytes, baseName(pdf.name) + '_compressed.pdf')] };
    }), 'primary')
  );
}

function optWatermark(host, pdf, status) {
  const tF = field('نص العلامة المائية (إنجليزي)', 'CONFIDENTIAL');
  host.append(
    panel(tF.el),
    button('💧  إضافة العلامة', () => status.run(async () => {
      const t = tF.get().trim();
      if (!t) throw new Error('اكتب نص العلامة');
      return { msg: '✅ تمت إضافة العلامة المائية', files: [pdfFile(await opWatermark(pdf.file, t), baseName(pdf.name) + '_watermark.pdf')] };
    }), 'primary')
  );
}

function optNumbers(host, pdf, status) {
  let pos = 1;
  host.append(
    panel(lbl('مكان الرقم أسفل الصفحة'), pills(['يسار', 'وسط', 'يمين'], 1, (i) => { pos = i; }).el),
    button('🔢  ترقيم الصفحات', () => status.run(async () => ({
      msg: '✅ تم ترقيم الصفحات', files: [pdfFile(await opNumbers(pdf.file, pos), baseName(pdf.name) + '_numbered.pdf')]
    })), 'primary')
  );
}

function optText(host, pdf, status) {
  host.append(button('📝  استخراج النص', () => status.run(async () => {
    const t = await opText(pdf.file);
    if (!t) return { msg: 'ℹ️ لا يوجد نص قابل للاستخراج (غالبًا الملف عبارة عن صور ممسوحة ضوئيًا).' };
    return { msg: '✅ تم استخراج النص', files: [new File([t], baseName(pdf.name) + '.txt', { type: 'text/plain' })] };
  }), 'primary'));
}

function optInfo(host, pdf, status) {
  const fs = [field('العنوان', ''), field('المؤلف', ''), field('الموضوع', ''), field('الكلمات المفتاحية (يفصل بينها فاصلة)', '')];
  opReadInfo(pdf.file).then((v) => v.forEach((x, i) => fs[i].set(x))).catch(() => {});
  host.append(
    panel(...fs.map((f) => f.el), note(`${pdf.pages} صفحة • ${fmtSize(pdf.size)}`)),
    button('💾  حفظ نسخة بالبيانات الجديدة', () => status.run(async () => ({
      msg: '✅ تم حفظ الملف بالبيانات الجديدة',
      files: [pdfFile(await opWriteInfo(pdf.file, fs.map((f) => f.get())), baseName(pdf.name) + '_edited.pdf')]
    })), 'primary')
  );
}

/* الشاشات */

function homeView() {
  const tile = (id, cls) => {
    const t = TOOL_BY_ID[id];
    return h('button', { class: 'tile ' + cls, type: 'button', style: '--c:' + t.c, onclick: () => openTool(id) },
      h('span', { class: 'emo' }, t.emoji),
      t.badge ? h('span', { class: 'badge' }, t.badge) : null,
      h('div', { class: 'tl' }, h('b', null, t.title), cls === 'hero' ? h('small', null, t.sub) : null));
  };
  const missing = !window.PDFLib || !window.pdfjsLib;
  return h('div', { class: 'home' },
    h('header', { class: 'brand' }, h('div', { class: 'logo' }, 'PDF'), h('div', null, h('h1', null, 'PDF Fusion'), h('p', null, 'كل أدوات PDF في مكان واحد'))),
    missing ? h('div', { class: 'warn' }, '⚠️ المكتبات لم تُحمَّل. اتصل بالإنترنت ثم أعد فتح التطبيق.') : null,
    tile('merge', 'hero'),
    h('div', { class: 'row3' }, tile('split', 'sq'), tile('extract', 'sq'), tile('delete', 'sq')),
    h('div', { class: 'row2' }, tile('rotate', 'rc'), tile('reorder', 'rc')),
    h('div', { class: 'row3' }, tile('img2pdf', 'sq'), tile('pdf2img', 'sq'), tile('compress', 'sq')),
    h('div', { class: 'row2' }, tile('watermark', 'rc'), tile('numbers', 'rc')),
    h('div', { class: 'row3' }, tile('text', 'sq'), tile('info', 'sq'), tile('view', 'sq')),
    h('div', { class: 'foot' }, 'كل المعالجة تتم على جهازك — لا يتم رفع أي ملف'));
}

function toolView(id) {
  const t = TOOL_BY_ID[id];
  const body = h('div', { class: 'body' });
  const builders = {
    merge: buildMerge, img2pdf: buildImages, view: buildViewer,
    split: (b) => buildSingle(b, 'split', optSplit),
    extract: (b) => buildSingle(b, 'extract', (hh, p, s) => optPages('extract', hh, p, s)),
    delete: (b) => buildSingle(b, 'delete', (hh, p, s) => optPages('delete', hh, p, s)),
    rotate: (b) => buildSingle(b, 'rotate', (hh, p, s) => optPages('rotate', hh, p, s)),
    reorder: (b) => buildSingle(b, 'reorder', (hh, p, s) => optPages('reorder', hh, p, s)),
    pdf2img: (b) => buildSingle(b, 'pdf2img', optPdf2Img),
    compress: (b) => buildSingle(b, 'compress', optCompress),
    watermark: (b) => buildSingle(b, 'watermark', optWatermark),
    numbers: (b) => buildSingle(b, 'numbers', optNumbers),
    text: (b) => buildSingle(b, 'text', optText),
    info: (b) => buildSingle(b, 'info', optInfo)
  };
  builders[id](body);
  return h('div', { class: 'tool' },
    h('div', { class: 'bar' }, h('button', { class: 'back', type: 'button', 'aria-label': 'رجوع', onclick: goHome }, '→'), h('h2', null, t.emoji + '  ' + t.title)),
    body);
}

function render() {
  cleanups.forEach((f) => { try { f(); } catch (e) { /* */ } });
  cleanups = [];
  const app = document.getElementById('app');
  app.replaceChildren(state.tool ? toolView(state.tool) : homeView());
  window.scrollTo(0, 0);
}
function openTool(id) { history.pushState({ tool: id }, ''); state.tool = id; render(); }
function goHome() {
  if (history.state && history.state.tool) history.back();
  else { state.tool = null; render(); }
}

function start() {
  if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_SRC;
  state.tool = (history.state && history.state.tool) || null;
  render();
  window.addEventListener('popstate', (e) => { state.tool = (e.state && e.state.tool) || null; render(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
                              }
