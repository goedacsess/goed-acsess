// Uji otomatis Goed Access sebelum push: sintaks, semua halaman dan modal di 4 lebar
// layar (terang dan gelap), alur transaksi beserta angka stok, dan jalur simpan gagal.
// Pemakaian: node tes.mjs            (dari folder mana pun)
// Keluar dengan kode 1 kalau ada yang gagal.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = join(ROOT, 'src');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const W = ms => new Promise(r => setTimeout(r, ms));
const gagal = [];
const lapor = (ok, nama, info) => { console.log((ok ? '  OK   ' : '  GAGAL ') + nama + (ok || info === undefined ? '' : '  ' + JSON.stringify(info).slice(0, 400))); if (!ok) gagal.push(nama); };

// 1. Sintaks: skrip inline index.html, main.js, preload.js
console.log('Sintaks');
const tmp = mkdtempSync(join(tmpdir(), 'goed-tes-'));
const html = readFileSync(join(SRC, 'index.html'), 'utf8');
[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].forEach((m, i) => {
  const f = join(tmp, `inline${i}.js`); writeFileSync(f, m[1]);
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); lapor(true, `index.html skrip #${i}`); }
  catch (e) { lapor(false, `index.html skrip #${i}`, String(e.stderr).split('\n').slice(0, 4).join(' ')); }
});
for (const f of ['main.js', 'preload.js']) {
  try { execFileSync(process.execPath, ['--check', join(ROOT, f)], { stdio: 'pipe' }); lapor(true, f); }
  catch (e) { lapor(false, f, String(e.stderr).split('\n')[0]); }
}

// 2. Server statis dan Chrome tanpa jendela
const port = 4100 + Math.floor(Math.random() * 800);
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', SRC], { stdio: 'ignore' });
const profil = join(tmp, 'chrome');
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profil}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const beres = () => { try { chrome.kill(); } catch {} try { server.kill(); } catch {} try { rmSync(tmp, { recursive: true, force: true }); } catch {} };
process.on('exit', beres);

let cdpPort;
for (let i = 0; i < 100 && !cdpPort; i++) { await W(100); const f = join(profil, 'DevToolsActivePort'); if (existsSync(f)) cdpPort = readFileSync(f, 'utf8').split('\n')[0]; }
if (!cdpPort) { console.log('Chrome tidak bisa dijalankan'); process.exit(1); }
const target = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const tunggu = new Map();
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); } });
const kirim = (method, params = {}) => new Promise(r => { const i = ++id; tunggu.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const jalankan = async (badan) => {
  const r = await kirim('Runtime.evaluate', { expression: `(async()=>{${badan}})()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return { __exc: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text };
  return r.result?.result?.value;
};
await kirim('Page.enable'); await kirim('Runtime.enable');
for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/`); break; } catch { await W(100); } }

// Dipasang di setiap muat ulang: tangkap error, jawab semua dialog "ya", masuk demo.
const PASANG = `
  window.__errs=[]; addEventListener('error',e=>__errs.push('ERR '+e.message+' baris '+e.lineno));
  addEventListener('securitypolicyviolation',e=>__errs.push('CSP memblokir '+e.violatedDirective+' '+e.blockedURI));
  addEventListener('unhandledrejection',e=>__errs.push('REJ '+(e.reason&&(e.reason.stack||e.reason.message)||e.reason)));
  const ce=console.error; console.error=(...a)=>{__errs.push('console.error '+a.map(String).join(' ').slice(0,200)); ce(...a)};
  window.dialogAppAsli=dialogApp; window.__dlg=[]; window.dialogApp=async m=>{__dlg.push(String(m).slice(0,80)); return true;}; window.alert=m=>__dlg.push('alert: '+String(m).slice(0,80));
  window.W=ms=>new Promise(r=>setTimeout(r,ms));
  if(!DEMO_MODE) masukDemo(); await W(1200);
  return true;`;
const muat = async (lebar, tinggi, gelap) => {
  await kirim('Emulation.setDeviceMetricsOverride', { width: lebar, height: tinggi, deviceScaleFactor: 1, mobile: lebar < 900 });
  await kirim('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  for (let i = 0; i < 100; i++) { await W(100); if (await jalankan(`return document.readyState==='complete'&&typeof masukDemo==='function'`)) break; }
  await W(600);
  const r = await jalankan(PASANG); if (r !== true) lapor(false, 'masuk demo', r);
  if (gelap) await jalankan(`if(!document.body.classList.contains('dark-mode')) toggleDarkMode(); await W(1600); return 1`);
};

const SAPU_HALAMAN = `
  const out=[]; const vw=innerWidth;
  for(const n of [...document.querySelectorAll('.nav-item[data-page]')]){ const p=n.dataset.page;
    try{ navTo(p); }catch(e){ out.push(p+': '+e.message); continue; } await W(350);
    if(document.documentElement.scrollWidth>vw+1) out.push(p+': halaman bisa digeser ke samping');
    const pg=document.getElementById(p); const luber=new Set();
    if(pg) pg.querySelectorAll('*').forEach(e=>{const r=e.getBoundingClientRect(); if(r.width>0&&r.right>vw+1){ let a=e.parentElement,klip=false; while(a&&a!==document.body){ if(getComputedStyle(a).overflowX!=='visible'&&a.getBoundingClientRect().right<=vw+1){klip=true;break} a=a.parentElement } if(!klip) luber.add((e.id?'#'+e.id:'')+'.'+String(e.className).split(' ')[0]) }});
    if(luber.size) out.push(p+': meluber '+[...luber].slice(0,4).join(' '));
  }
  navTo('dashboard'); return {out, errs:__errs};`;

const SAPU_MODAL = `
  const s=stock[0], t=services.find(x=>x.revenue>(x.paidAmount||0))||services[0], pu=purchases.find(x=>x.total>(x.paidAmount||0))||purchases[0];
  const daftar=[['tambah stok',()=>openStockModal()],['edit stok',()=>openStockModal(s.id)],['aksi stok',()=>openStockActions(s.id)],['riwayat stok',()=>openStockHistoryModal(s.id)],['transaksi servis',()=>openServiceModal()],['nota HP',()=>openNotaHP(services[0].id)],['barang baru pembelian',()=>openNewPurchaseItem()],['pengeluaran',()=>openExpenseModal()],['ubah tanggal',()=>openEditDateModal(services[0].id)],['bayar piutang',()=>openPayServiceModal(t.id)],['bayar utang',()=>pu&&openPayPurchaseModal(pu.id)],['cabang',()=>openBranchModal()],['user',()=>openUserModal()],['metode bayar',()=>openEditPaymentMethodModal('service',services[0].id)],['cari global',()=>openGlobalSearch()],['pilih cabang',()=>openBranchPick()],['ubah status',()=>changeStatus(services[0].id)]];
  const out=[];
  for(const [n,f] of daftar){ try{ await f(); }catch(e){ out.push(n+': '+e.message); continue; } await W(300);
    const mc=document.querySelector('#modalBg.active #modalContent');
    if(mc){ const M=mc.getBoundingClientRect(); const luber=new Set(); mc.querySelectorAll('*').forEach(e=>{const r=e.getBoundingClientRect(); if(r.width&&(r.right>M.right+1||r.left<M.left-1)) luber.add('.'+String(e.className).split(' ')[0]+'<'+e.tagName)});
      if(M.right>innerWidth+1||M.left<-1) out.push(n+': modal keluar layar'); if(luber.size) out.push(n+': isi meluber '+[...luber].slice(0,4).join(' ')); }
    closeModal(); document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); await W(120); }
  return {out, errs:__errs};`;

const ALUR = `
  const R=[]; const cek=(n,c,info)=>R.push([n,!!c,c?undefined:info]);
  const a=stock.find(s=>s.qty>=3), b=stock.find(s=>s.qty>=1&&s!==a); const qa=a.qty,qb=b.qty,n0=services.length;
  openServiceModal(); await W(150); svcAdd(a.id); svcAdd(a.id); svcAdd(b.id); document.getElementById('s_cust').value='Tes'; document.getElementById('s_jasa').value='50.000'; await saveService(); await W(100);
  const t=services[0]; cek('servis tersimpan', services.length===n0+1&&t.cust==='Tes');
  cek('servis memotong stok', a.qty===qa-2&&b.qty===qb-1,[qa,a.qty,qb,b.qty]);
  cek('servis total dan modal', t.revenue===50000+2*a.price+b.price&&t.cogs===2*a.cost+b.cost,[t.revenue,t.cogs]);
  await delService(t.id); cek('hapus servis mengembalikan stok', a.qty===qa&&b.qty===qb&&!services.includes(t));
  const c=stock.find(s=>s.qty>=1); openServiceModal(); await W(100); for(let i=0;i<c.qty+2;i++) svcAdd(c.id); cek('qty sparepart dibatasi stok', svcParts[0].qty===c.qty,[svcParts[0].qty,c.qty]); closeModal();
  openServiceModal(); await W(100); document.getElementById('s_jasa').value='100.000'; const ps=document.getElementById('s_paystatus'); ps.value='belum'; ps.dispatchEvent(new Event('change')); document.getElementById('s_payamount').value='30.000'; await saveService();
  const t2=services[0]; cek('servis belum lunas', t2.paidAmount===30000,[t2.paidAmount]);
  openPayServiceModal(t2.id); await W(100); document.getElementById('pay_amount').value='999.000'; await savePayService(t2.id); cek('bayar piutang dibatasi total', t2.paidAmount===t2.revenue,[t2.paidAmount,t2.revenue]);
  const e0=expenses.length; openExpenseModal(); await W(100); document.getElementById('e_cat').value='Listrik'; document.getElementById('e_amount').value='75.000'; await saveExpense(); cek('pengeluaran', expenses.length===e0+1&&expenses.some(e=>e.amount===75000));
  const k0=stock.length; openStockModal(); await W(100); document.getElementById('m_name').value='Barang Tes'; document.getElementById('m_qty').value='3'; await saveStock(); cek('tambah stok', stock.length===k0+1);
  navTo('pembelian'); await W(250); const s=stock[2]; const q0=s.qty,p0=purchases.length; pbAdd(s.id); const it=pbState.items.at(-1); it.qty=4; it.cost=12000; pbState.payStatus='belum'; pbState.payAmount=20000; await savePurchases();
  const np=purchases[0]; cek('pembelian menambah stok', s.qty===q0+4,[q0,s.qty]); cek('pembelian tercatat', purchases.length===p0+1&&np.total===48000&&np.paidAmount===20000,np);
  openPayPurchaseModal(np.id); await W(100); document.getElementById('pay_amount2').value='999.000'; await savePayPurchase(np.id); cek('bayar utang dibatasi total', np.paidAmount===np.total);
  navTo('audit'); await W(250); const x=stock[3]; const xq=x.qty; auditState.ids=[x.id]; auditState.phys={[x.id]:xq+5}; auditState.note='tes'; const a0=audits.length; await saveAudit();
  cek('audit menyetel stok fisik', x.qty===xq+5&&audits.length===a0+1&&audits[0].items[0].diff===5,[xq,x.qty]);
  await delAudit(audits[0].id); cek('hapus audit mengembalikan stok', x.qty===xq&&audits.length===a0,[xq,x.qty]);
  const berkas=[]; const oc=HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click=function(){ if(this.download) berkas.push(this.download); else oc.call(this); };
  for(const j of ['stock','services','purchases']) exportExcel(j); navTo('pengeluaran'); await W(200); downloadPengeluaran(); navTo('riwayat'); await W(200); downloadRiwayat();
  HTMLAnchorElement.prototype.click=oc; cek('ekspor CSV (5 berkas)', berkas.length===5, berkas);
  const jendela=[]; const oo=window.open; window.open=()=>({document:{write:h=>jendela.push(h.length),close(){}},focus(){},print(){},addEventListener(){}});
  printNota(services[0].id); navTo('laporan'); await W(200); printLaporanKeuangan(); window.open=()=>null; printNota(services[0].id); window.open=oo;
  cek('cetak nota dan laporan', jendela.length===2&&__dlg.some(d=>/diblokir/.test(d)), jendela);
  navTo('riwayat'); await W(250); for(const r of [...document.querySelectorAll('#riwayat [onclick*="riwPick"]')].slice(0,10)){ r.click(); await W(80); }
  demoDipakai=DEMO_MAX; const y=stock.find(s=>s.qty>=1); const yq=y.qty, n1=services.length; openServiceModal(); await W(100); svcAdd(y.id); await saveService(); closeModal();
  cek('demo penuh tidak memotong stok', y.qty===yq&&services.length===n1,[yq,y.qty]);
  // Lapisan: elemen yang seharusnya di depan benar-benar bisa disentuh di tengahnya.
  const diDepan=(sel)=>{ const el=document.querySelector(sel); if(!el) return false; const r=el.getBoundingClientRect(); return [[.5,.5],[.1,.9],[.9,.9]].every(([fx,fy])=>{ const t=document.elementFromPoint(r.left+r.width*fx, r.top+r.height*fy); return t&&el.contains(t); }); };
  if(innerWidth<900){ toggleMobileMenu(); await W(400); }
  document.getElementById('sidebarExitItem').click(); await W(500);
  cek('Akun: laci tertutup, kartu login paling depan', !document.querySelector('.sidebar.mobile-open')&&diDepan('#loginScreen .login-content'));
  const asli=window.dialogApp; window.dialogApp=dialogAppAsli; const p1=tanya('tes lapisan'); await W(200);
  cek('dialog di atas kartu login', diDepan('.dlg-bg .dlg')); document.querySelector('.dlg-bg [data-v="0"]').click(); await p1; window.dialogApp=asli;
  tutupKartuLogin(); await W(200);
  openServiceModal(); await W(200); window.dialogApp=dialogAppAsli; const p2=tanya('tes lapisan'); await W(200);
  cek('dialog di atas modal', diDepan('.dlg-bg .dlg')); document.querySelector('.dlg-bg [data-v="0"]').click(); await p2; window.dialogApp=asli; closeModal();
  if(innerWidth>=1200){ navTo('absensi'); for(let i=0;i<60&&!faceModelsLoaded;i++) await W(250); cek('model wajah absensi termuat (CSP)', faceModelsLoaded===true); }
  // iOS memperbesar layar kalau kolom isian di bawah 16px diketuk, dan zoom itu menetap.
  if(innerWidth<900){ const kecil=new Set(); const cekF=()=>document.querySelectorAll('input,select,textarea,.cs-btn').forEach(e=>{ if(['hidden','checkbox','radio','file'].includes(e.type)) return; const fs=parseFloat(getComputedStyle(e).fontSize); if(fs<16) kecil.add((e.id||e.className)+' '+fs); });
    for(const n of [...document.querySelectorAll('.nav-item[data-page]')]){ navTo(n.dataset.page); await W(120); cekF(); }
    for(const f of [()=>openServiceModal(),()=>openStockModal(),()=>openExpenseModal(),()=>openNewPurchaseItem(),()=>openUserModal()]){ f(); await W(150); cekF(); closeModal(); }
    keluarDemo(); await W(150); cekF(); tutupKartuLogin(); navTo('dashboard'); await W(150);
    cek('HP: semua kolom isian minimal 16px (cegah zoom iOS)', !kecil.size, [...kecil]); }
  // Laporan: uang masuk per metode, jumlahnya harus sama dengan total, dan Cash/cash/Tunai digabung.
  { cek('Metode: Cash, cash, Tunai digabung', labelMetode('cash')==='Cash'&&labelMetode(' Tunai ')==='Cash'&&labelMetode('')==='Cash'&&labelMetode('QRIS')==='QRIS'&&labelMetode('qris')==='QRIS'&&labelMetode('Edc')==='EDC'&&labelMetode('GoPay')==='GoPay');
    navTo('laporan'); await W(400);
    const tot=(lapMetodeData.total||[]).reduce((a,m)=>a+m.jumlah,0), ak=calcArusKas(lapRange(document.getElementById('lapPeriod').value).start, lapRange(document.getElementById('lapPeriod').value).end);
    cek('Laporan: rincian metode = total uang masuk', tot>0 && tot===ak.kasMasuk && ak.kasMasukMetode.reduce((a,m)=>a+m.jumlah,0)===ak.kasMasuk, [tot, ak.kasMasuk]);
    const bt=[...document.querySelectorAll('#lapCards .lap-dd')].find(b=>!b.getAttribute('onclick').includes('j:')); bt&&bt.click(); await W(200);
    const pop=document.querySelector('.lap-pop'); const r=pop&&pop.getBoundingClientRect();
    cek('Laporan: rincian metode terbuka dan muat di layar', !!pop && pop.querySelectorAll('.lap-pop-row').length===(lapMetodeData.total||[]).length && r.left>=0 && r.right<=innerWidth);
    document.body.click(); await W(100); cek('Laporan: rincian tertutup saat klik di luar', !document.querySelector('.lap-pop'));
    // Penjualan per metode dihitung dari total transaksi, termasuk yang belum lunas.
    const rg=lapRange(document.getElementById('lapPeriod').value), jual=bServices().filter(x=>x.date>=rg.start&&x.date<=rg.end);
    const totJ=(lapMetodeData['j:total']||[]).reduce((a,m)=>a+m.jumlah,0), revJ=jual.reduce((a,x)=>a+(x.revenue||0),0);
    cek('Laporan: rincian penjualan per metode = total penjualan (lunas dan belum)', totJ>0 && totJ===revJ && jual.some(x=>(x.paidAmount||0)<x.revenue), [totJ, revJ]);
    const bj=document.querySelector('#lapCards .lap-dd[onclick*="j:total"]');
    // Taruh tombol tepat di atas menu bawah (keadaan terburuk), lalu buka rinciannya.
    // Ukur tinggi kotaknya dulu, lalu taruh tombol serendah mungkin yang masih membuat kotak muat di layar
    // menurut aturan lama: kotak akan jatuh di atas menu bawah kalau posisinya tidak memperhitungkan menu itu.
    if(bj){ bj.click(); await W(150); const hp=document.querySelector('.lap-pop')?.offsetHeight||0; document.body.click(); await W(100);
      scrollBy(0, bj.getBoundingClientRect().bottom-(innerHeight-16-hp)); await W(300); bj.click(); await W(200); }
    const pj=document.querySelector('.lap-pop'), rj=pj&&pj.getBoundingClientRect();
    cek('Laporan: rincian penjualan terbuka dari kartu Total Penjualan', !!pj && pj.getAttribute('aria-label').startsWith('Penjualan') && pj.querySelectorAll('.lap-pop-row').length===lapMetodeData['j:total'].length && rj.left>=0 && rj.right<=innerWidth);
    const tutupBawah=['tabbar','demoBar'].map(id=>document.getElementById(id)).filter(el=>el&&el.getClientRects().length&&getComputedStyle(el).position==='fixed').some(el=>{ const t=el.getBoundingClientRect(); return pj&&rj.bottom>t.top&&rj.top<t.bottom&&rj.right>t.left&&rj.left<t.right; });
    cek('Laporan: rincian tidak menutupi menu bawah dan bilah demo', !tutupBawah);
    document.body.click(); await W(100);
    cek('Laporan: tombol rincian penjualan ada di tiap baris yang berisi', [...document.querySelectorAll('#lapTable tbody td[data-l="Total Penjualan"]')].every(td=>td.textContent.trim()==='-'||!!td.querySelector('.lap-dd'))); }
  // Pembaca Excel (impor Kelola/stok): baca ulang file buatan sendiri, isi harus sama.
  { const aoa=[['Nama Produk','SKU','Kategori','Stok','Harga Modal','Harga Jual'],['LCD iPhone 11','LCD-11','LCD/Layar',5,450000,750000],['Baterai "X" & <12>','BAT-12','Baterai',0,180000,350000]];
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),'Produk');
    const buf=XLSX.write(wb,{type:'array',bookType:'xlsx'});
    const rows=XLSX.utils.sheet_to_json(XLSX.read(buf,{type:'array'}).Sheets['Produk'],{defval:''});
    cek('Excel: versi SheetJS bebas CVE (>=0.20.2)', XLSX.version.split('.').map(Number).reduce((a,v)=>a*1000+v,0)>=20002, XLSX.version);
    cek('Excel: tulis lalu baca ulang, isi sama', rows.length===2&&rows[0]['Nama Produk']==='LCD iPhone 11'&&rows[0]['Harga Jual']===750000&&rows[1]['Nama Produk']==='Baterai "X" & <12>'&&rows[1].Stok===0, rows); }
  // XSS: data dari server yang ditulis orang lain lewat API tidak boleh menjalankan kode.
  window.__xss=0;
  cek('XSS: ID berisi tanda kutip ditolak', !idAman({id:"x');window.__xss=1;//"}) && idAman({id:gid()}));
  const jahat='<img src=x onerror="window.__xss=1">';
  const sj=fromDbService({id:gid(),branch_id:currentBranch,inv:'X1',service_date:todayStr(),cust:jahat,device:jahat,issue:jahat,status:jahat,revenue:1,cogs:0,paid_amount:0,payment_method:jahat,parts:[{partId:'a',partName:jahat,qty:'1<img src=x onerror="window.__xss=1">',partPrice:1}]});
  services.unshift(sj); branches.find(b=>b.id===currentBranch).name=jahat; renderAll();
  for(const pg of ['kasir','riwayat','dashboard','utangpiutang']){ navTo(pg); await W(250); }
  const aj=fromDbAudit({id:gid(),branch_id:currentBranch,audit_date:todayStr(),audited_by:jahat,items:[{id:stock[0].id,name:jahat,system:'1<img src=x onerror="window.__xss=1">',physical:2,diff:'<b>1'}]});
  audits.unshift(aj); renderAll(); navTo('audit'); await W(250); openStockHistoryModal(stock[0].id); await W(250); closeModal();
  await W(300); cek('XSS: data jahat tampil sebagai teks, tidak dijalankan', window.__xss===0 && !document.querySelector('img[src="x"]'));
  services=services.filter(x=>x!==sj); audits=audits.filter(x=>x!==aj); renderAll();
  navTo('pengaturan'); await W(300); cek('Update Aplikasi tersembunyi di luar desktop', document.getElementById('updateSection').classList.contains('hidden'));
  if(innerWidth<900){ navTo('pengeluaran'); await W(300); const kw=document.querySelector('.exp-table-wrap'), kd=kw&&kw.querySelector('tbody td'); cek('kartu Pengeluaran HP punya jarak dalam', kd&&kd.getBoundingClientRect().left-kw.getBoundingClientRect().left>=8); }
  if(innerWidth>=1200){ navTo('kasir'); await W(300); const ra=document.querySelector('#transaksiTable .row-actions'); const bs=ra?[...ra.children].map(b=>Math.round(b.getBoundingClientRect().top)):[]; cek('tombol aksi Kasir sebaris di desktop', bs.length>1&&new Set(bs).size===1, bs); }
  if(innerWidth<900){ toggleMobileMenu(); await W(400); cek('laci menu di atas bilah demo dan tab', diDepan('.sidebar')); closeMobileMenu(); await W(300); }
  return {R, errs:__errs};`;

const GAGAL_SERVER = `
  const R=[]; const cek=(n,c,info)=>R.push([n,!!c,c?undefined:info]);
  const asli=sb.from; const err={error:{message:'tes gagal'}}; const q=()=>{const o={insert:()=>Promise.resolve(err),update:()=>o,delete:()=>o,eq:()=>Promise.resolve(err),upsert:()=>Promise.resolve(err),select:()=>o}; return o;};
  DEMO_MODE=false; sb.from=q;
  try{
    const a=stock.find(s=>s.qty>=1); const qa=a.qty,n0=services.length; openServiceModal(); await W(100); svcAdd(a.id); await saveService(); cek('servis gagal: dibatalkan', services.length===n0&&a.qty===qa,[a.qty,qa]);
    const e0=expenses.length; openExpenseModal(); await W(100); document.getElementById('e_cat').value='X'; document.getElementById('e_amount').value='5.000'; await saveExpense(); cek('pengeluaran gagal: dibatalkan', expenses.length===e0);
    const k0=stock.length; openStockModal(); await W(100); document.getElementById('m_name').value='Gagal'; await saveStock(); cek('tambah stok gagal: dibatalkan', stock.length===k0);
    navTo('audit'); await W(200); const x=stock[4]; const xq=x.qty; auditState.ids=[x.id]; auditState.phys={[x.id]:xq+2}; auditState.note=''; const a0=audits.length; await saveAudit(); cek('audit gagal: stok dan catatan dibatalkan', x.qty===xq&&audits.length===a0,[x.qty,xq]);
    const t=services.find(s=>s.revenue>(s.paidAmount||0)); if(t){ const p0=t.paidAmount; openPayServiceModal(t.id); await W(100); document.getElementById('pay_amount').value='1.000'; await savePayService(t.id); cek('bayar gagal: dibatalkan', t.paidAmount===p0); }
    const d=services[0], b=(d.parts||[]).map(p=>stock.find(s=>s.id===p.partId)).filter(Boolean), bq=b.map(s=>s.qty); await delService(d.id); cek('hapus servis gagal: dibatalkan', services.includes(d)&&b.every((s,i)=>s.qty===bq[i]));
  } finally { sb.from=asli; DEMO_MODE=true; }
  return {R, errs:__errs.filter(e=>!/tes gagal|^console\.error /.test(e))};`;

const UKURAN = [[375, 812, 'HP'], [768, 1024, 'tablet'], [1024, 768, 'tablet landscape'], [1440, 900, 'desktop']];
for (const gelap of [false, true]) {
  for (const [w, h, nama] of UKURAN) {
    console.log(`\n${nama} ${w}px${gelap ? ', mode gelap' : ''}`);
    await muat(w, h, gelap);
    const hal = await jalankan(SAPU_HALAMAN);
    lapor(!hal.__exc && !hal.out.length && !hal.errs.length, 'semua halaman', hal.__exc || [...hal.out, ...hal.errs]);
    const mod = await jalankan(SAPU_MODAL);
    lapor(!mod.__exc && !mod.out.length && !mod.errs.length, 'semua modal', mod.__exc || [...mod.out, ...mod.errs]);
  }
}
for (const [w, h, nama] of [[375, 812, 'HP'], [1440, 900, 'desktop']]) {
  console.log(`\nAlur transaksi, ${nama}`);
  await muat(w, h, false);
  const r = await jalankan(ALUR);
  if (r.__exc) lapor(false, 'alur transaksi', r.__exc); else { r.R.forEach(([n, ok, info]) => lapor(ok, n, info)); lapor(!r.errs.length, 'tanpa error JS', r.errs); }
}
console.log('\nServer menolak simpan');
await muat(1440, 900, false);
const g = await jalankan(GAGAL_SERVER);
if (g.__exc) lapor(false, 'jalur gagal', g.__exc); else { g.R.forEach(([n, ok, info]) => lapor(ok, n, info)); lapor(!g.errs.length, 'tanpa error JS', g.errs); }

// Sesi tersimpan tapi server tidak terjangkau: harus layar "Gagal Terhubung", bukan demo.
console.log('\nBuka aplikasi saat server tidak terjangkau');
{ await kirim('Network.enable');
  await kirim('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  const skrip = await kirim('Page.addScriptToEvaluateOnNewDocument', { source: `try{ localStorage.setItem('sb-bmlvkotnhdogeckfqgmr-auth-token', JSON.stringify({access_token:'x',refresh_token:'y',expires_at:1,expires_in:3600,token_type:'bearer',user:{id:'00000000-0000-0000-0000-000000000000'}})); }catch(e){}` });
  await kirim('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await kirim('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  let hasil;
  for (let i = 0; i < 40; i++) { await W(500); hasil = await jalankan(`return {demo: typeof DEMO_MODE!=='undefined' && DEMO_MODE, gagal: /Gagal Terhubung/.test(document.getElementById('loadingScreen')?.innerText||'')}`); if (hasil && (hasil.gagal || hasil.demo)) break; }
  lapor(!!hasil && hasil.gagal && !hasil.demo, 'sesi tersimpan + server mati: layar Gagal Terhubung, bukan mode demo', hasil);
  await kirim('Page.removeScriptToEvaluateOnNewDocument', { identifier: skrip.result.identifier });
  await kirim('Network.setBlockedURLs', { urls: [] }); }

console.log(gagal.length ? `\n${gagal.length} GAGAL: ${gagal.join('; ')}` : '\nSemua lolos.');
ws.close(); beres();
process.exit(gagal.length ? 1 : 0);
