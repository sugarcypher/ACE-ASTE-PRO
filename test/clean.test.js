#!/usr/bin/env node
/*
 * AcePaste cleaning-engine tests — zero dependencies, no build step.
 *
 *   Run:  node test/clean.test.js
 *
 * These tests do NOT retype the cleaning rules. They extract the real
 * regexes from app-critical.js at runtime, so the suite always exercises
 * the exact code the site ships. If a rule changes in source, the test
 * follows it automatically (and fails if the change breaks a guarantee).
 *
 * Scope: pure cleaning logic only. DOM wiring (checkbox reads, clipboard,
 * report rendering) is not covered here — there is no headless browser in
 * this repo. Keep that in mind when adding cases.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app-critical.js'), 'utf8');

// --- Pull the real INVISIBLE_CHAR_REGEX literal out of the source ---
const invLine = SRC.split('\n').find(l => l.includes('const INVISIBLE_CHAR_REGEX'));
if (!invLine) throw new Error('Could not locate INVISIBLE_CHAR_REGEX in app-critical.js');
const INVISIBLE_CHAR_REGEX = eval(invLine.replace(/^.*?=\s*/, '').replace(/;\s*$/, ''));

// --- Pull the real "Remove comments" block body out of the source ---
const blockMatch = SRC.match(/getElement\(.removeComments.\)\.checked\)\s*\{([\s\S]*?)report\.comments/);
if (!blockMatch) throw new Error('Could not locate removeComments block in app-critical.js');
const replaceStmts = blockMatch[1].match(/text = text\.replace\([\s\S]*?\);/g);
if (!replaceStmts || !replaceStmts.length) throw new Error('No replace statements found in removeComments block');
// Reconstruct a function from the exact statements in source.
const removeComments = new Function('text', replaceStmts.join('\n') + '\nreturn text;');
const stripInvisible = s => s.replace(INVISIBLE_CHAR_REGEX, '');

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name);
  if (!ok) console.log('      got : ' + JSON.stringify(got) + '\n      want: ' + JSON.stringify(want));
}

console.log('Extracted ' + replaceStmts.length + ' comment-removal statements from source\n');

console.log('=== URL preservation (regression: https:// must not be treated as a // comment) ===');
eq('https URL survives',        removeComments('https://www.example.com/path?q=hello+world&x=1'), 'https://www.example.com/path?q=hello+world&x=1');
eq('http URL survives',         removeComments('http://foo.bar/baz'), 'http://foo.bar/baz');
eq('ftp URL survives',          removeComments('ftp://host/file'), 'ftp://host/file');
eq('URL in a sentence survives', removeComments('see https://a.com/x for more'), 'see https://a.com/x for more');
eq('two URLs survive',          removeComments('a https://x.com/1 b http://y.com/2'), 'a https://x.com/1 b http://y.com/2');

console.log('\n=== Real comments still stripped ===');
eq('leading // comment',          removeComments('// secret\nkept'), '\nkept');
eq('trailing // comment',         removeComments('code(); // note'), 'code(); ');
eq('URL + real // comment',       removeComments('https://a.com // note'), 'https://a.com ');
eq('/* block */ stripped',        removeComments('/* x */ visible'), ' visible');
eq('<!-- html --> stripped',      removeComments('<!-- c --> visible'), ' visible');
eq('# bold marker stripped',      removeComments('# bold this line'), '');

console.log('\n=== Invisible-char engine: the core promise — must catch ALL ===');
eq('zero-width space U+200B', stripInvisible('a​b'), 'ab');
eq('ZWNJ U+200C',             stripInvisible('a‌b'), 'ab');
eq('ZWJ U+200D',              stripInvisible('a‍b'), 'ab');
eq('BOM U+FEFF',              stripInvisible('﻿x'), 'x');
eq('soft hyphen U+00AD',      stripInvisible('a­b'), 'ab');
eq('LRM U+200E (Cf)',         stripInvisible('a‎b'), 'ab');
eq('bidi RLO U+202E (Cf)',    stripInvisible('a‮b'), 'ab');
eq('word joiner U+2060',      stripInvisible('a⁠b'), 'ab');
eq('Hangul filler U+3164',    stripInvisible('aㅤb'), 'ab');
eq('variation selector FE0F', stripInvisible('a️b'), 'ab');
eq('tag char U+E0041',        stripInvisible('a\u{E0041}b'), 'ab');
eq('NEL U+0085',              stripInvisible('ab'), 'ab');
eq('line separator U+2028',   stripInvisible('a b'), 'ab');
eq('normal text untouched',   stripInvisible('Hello, world! 123'), 'Hello, world! 123');

console.log('\n----------------------------------------');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
