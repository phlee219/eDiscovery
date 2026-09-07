// Strict-profile fixture driver (field_mapper.html v2.18.5, 100% local).
// Node >= 20, no dependencies. Every "blocked" fixture must fail closed and
// every "good" fixture must round-trip losslessly at the CORE level.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {strictFixtures} from './fixtures.mjs';

const html=readFileSync(new URL('../field_mapper.html',import.meta.url),'utf8');
const script=html.slice(html.indexOf('<script>')+8,html.indexOf('</script>'));
new vm.Script(script); // parse the complete shipping script
function section(a,b){const i=script.indexOf(a),j=script.indexOf(b,i+1);assert(i>=0&&j>i,a);return script.slice(i,j);}
const ctx=vm.createContext({console,TextEncoder,TextDecoder,Uint8Array,Uint16Array,Uint32Array,DataView,ArrayBuffer,File,Blob,setTimeout,clearTimeout});
// Core block + SHA-256 implementation are required by buildFileIndex/sniffMeta.
// The core section declares its own currentRecordIdxForStats/setBusy etc., so no
// extra stubs are appended (duplicates would throw at eval time).
vm.runInContext(section('/* __EDML_CORE_BEGIN__','/* __EDML_CORE_END__')+
  section('function sha256RotR(',"let auditText ="),ctx);
const run=code=>vm.runInContext(code,ctx);
const api=run('({feSplit,feCompose,detectFormat,sniffMeta,buildFileIndex,textToBytes,metaBomBytes})');
const compose=f=>api.feCompose(f);
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
function makeFile(text,kind='utf-8',bom=false){
  const meta={kind,hasBOM:bom,bomBytes:bom?(kind==='utf-8'?3:2):0};
  return new File([api.metaBomBytes(meta),api.textToBytes(meta,text)],'fixture.dat');
}

await test('strict profile rejects every blocked line fixture',async()=>{
  assert.equal(api.detectFormat(strictFixtures.blockedLegacyNoDc4.line),'legacy-fe');
  for(const key of ['blockedLegacyNoDc4','blockedLiteralThorn','blockedRawDc4','blockedMultilineValue','blockedMalformedRow']){
    const fx=strictFixtures[key];
    assert.throws(()=>api.feSplit(fx.line),
      /enclos|malformed|unsafe|delimiter|qualifier|CR|newline|column|U\+0014|U\+00FE/i, fx.desc);
  }
});

const plain=v=>JSON.parse(JSON.stringify(v));
await test('good FE fixtures round-trip and index cleanly',async()=>{
  for(const key of ['goodBasic','goodSingleColumn']){
    const fx=strictFixtures[key];
    assert.deepEqual(plain(api.feSplit(compose(fx.header))),fx.header.map(h=>String(h)), key);
    const text=[fx.header,...fx.rows].map(r=>compose(r)).join('\r\n')+'\r\n';
    const file=makeFile(text);
    const meta=await api.sniffMeta(file);
    assert.equal(meta.kind,'utf-8',key);
    const idx=await api.buildFileIndex(file,meta,'fe');
    assert.equal(idx.dataRecords,fx.expectDataRows,key);
    assert.equal(idx.headerNames.length,fx.expectHeaderCols,key);
    assert.equal(idx.mismatched,fx.expectMismatch,key);
    assert.equal(idx.parseErrors,0,key);
  }
});

await test('UTF-16 LE + BOM good fixture round-trips through sniff/index',async()=>{
  const fx=strictFixtures.goodUtf16LeWithBom;
  const text=[fx.header,...fx.rows].map(r=>compose(r)).join('\r\n')+'\r\n';
  const file=makeFile(text,'utf-16le',true);
  const meta=await api.sniffMeta(file);
  assert.equal(meta.kind,'utf-16le');
  assert.equal(meta.hasBOM,true);
  const idx=await api.buildFileIndex(file,meta,'fe');
  assert.equal(idx.dataRecords,fx.expectDataRows);
  assert.equal(idx.headerNames.length,fx.expectHeaderCols);
  assert.equal(idx.mismatched,0);
});

await test('CP1252 bytes are detected as blocked cp1252, never silently U+FFFD',async()=>{
  // 'þDOCIDþ' encoded as single-byte CP1252/Latin-1 bytes; it is NOT valid UTF-8.
  const bytes=Uint8Array.from([0xFE,0x44,0x4F,0x43,0x49,0x44,0xFE]);
  const meta=await api.sniffMeta(new File([bytes],'cp.dat'));
  assert.equal(meta.kind,'cp1252');
});

console.log(`\n${passed} strict-profile fixture groups passed.`);
