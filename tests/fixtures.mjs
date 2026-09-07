// Synthetic load-file fixtures aligned with the STRICT FE/DC4 production profile
// (field_mapper.html v2.18.5). They feed tests/strict_fixture_tests.mjs.
//
// The strict profile blocks: ambiguous legacy no-DC4 FE rows, a literal U+00FE
// (þ) inside a value, raw U+0014 (DC4) inside a value, raw CR/LF inside a value,
// CP1252, field-count mismatches, and mixed record EOL. Every "blocked" fixture
// must fail closed; every "good" fixture must round-trip losslessly.
const FE = '\u00FE';
const DC4 = '\u0014';

export const strictFixtures = {

  blockedLegacyNoDc4: {
    desc: 'ambiguous legacy no-DC4 FE (consecutive FE pairs, no U+0014 separator) is classified as blocked',
    line: FE + 'A' + FE + FE + 'B' + FE,
    expectDetect: 'legacy-fe',
    blocked: true
  },

  blockedLiteralThorn: {
    desc: 'literal U+00FE (þ) inside a field value is rejected',
    line: FE + 'A' + FE + DC4 + FE + 'x' + FE + 'y' + FE,
    blocked: true
  },

  blockedRawDc4: {
    desc: 'raw U+0014 (DC4) inside a field value is rejected',
    line: FE + 'A' + FE + DC4 + FE + 'x' + DC4 + 'y' + FE,
    blocked: true
  },

  blockedMultilineValue: {
    desc: 'raw CR/LF inside a field value is rejected',
    line: FE + 'A' + FE + DC4 + FE + 'x\ny' + FE,
    blocked: true
  },

  blockedMalformedRow: {
    desc: 'row that is not fully enclosed by þ qualifiers is rejected',
    line: FE + 'A' + DC4 + 'B',
    blocked: true
  },

  goodBasic: {
    desc: 'FE/DC4 with empty / trailing-empty / whitespace / tab / Unicode cells round-trips',
    header: ['DOCID', 'NAME', '  TXT  '],
    rows: [
      ['D1', '', ''],
      ['D2', '한국어 😀', '  a\tb  '],
      ['D3', '', 'last']
    ],
    expectHeaderCols: 3,
    expectDataRows: 3,
    expectMismatch: 0
  },

  goodSingleColumn: {
    desc: 'a single-column FE/DC4 file (no U+0014 needed) round-trips',
    header: ['DOCID'],
    rows: [['ABC0001'], [' ABC0002 ']],
    expectHeaderCols: 1,
    expectDataRows: 2,
    expectMismatch: 0
  },

  goodUtf16LeWithBom: {
    desc: 'UTF-16 LE with BOM round-trips through sniff/index',
    kind: 'utf-16le',
    bom: true,
    header: ['DOCID', 'TXT'],
    rows: [['D1', 'body\u00AEhere'], ['D2', '']],
    expectHeaderCols: 2,
    expectDataRows: 2,
    expectMismatch: 0
  }
};

export { FE, DC4 };

