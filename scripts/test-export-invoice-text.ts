// Run: npx tsx scripts/test-export-invoice-text.ts
import { makeSafeText } from '../lib/export-invoice-pdf';

// Same idea as Helvetica WinAnsi: basic ASCII + Latin-1 letters.
const has = (cp: number) => (cp >= 32 && cp <= 126) || (cp >= 0xa1 && cp <= 0xff);
const safe = makeSafeText(has);
let fail = 0;
const eq = (name: string, got: string, want: string) => {
  if (got !== want) { fail++; console.log(`FAIL ${name}: got "${got}" want "${want}"`); } else console.log(`ok   ${name}`);
};
eq('plain ascii', safe('John Smith, 12 Main St'), 'John Smith, 12 Main St');
eq('latin-1 kept', safe('José Müller'), 'José Müller');
eq('macron -> plain', safe('Fātima'), 'Fatima');
eq('cedilla s', safe('Şeyma'), 'Seyma');
eq('polish l', safe('Łukasz'), 'Lukasz');
eq('turkish dotless i', safe('Kızıl'), 'Kizil');
eq('curly quotes', safe('It\u2019s \u201Cok\u201D'), `It's "ok"`);
eq('newline', safe('a\nb'), 'a b');
eq('arabic stays ?', safe('محمد'), '????');
eq('mixed', safe('Ali محمد'), 'Ali ????');
eq('empty/undefined', safe(undefined as any), '');
console.log(fail ? `${fail} FAILED` : 'ALL PASS');
process.exit(fail ? 1 : 0);
