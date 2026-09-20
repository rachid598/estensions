import { test } from 'node:test';
import assert from 'node:assert/strict';

import { domainToUnicode } from 'node:url';

import { normalizeHost, normalizeList } from '../tools/lib/normalize.mjs';

const host = (line) => normalizeHost(line).host;
const skip = (line) => normalizeHost(line).skip;

test('formes courantes des listes amont', () => {
  assert.equal(host('exemple.com'), 'exemple.com');
  assert.equal(host('  exemple.com  '), 'exemple.com');
  assert.equal(host('EXEMPLE.COM'), 'exemple.com');
  assert.equal(host('exemple.com.'), 'exemple.com');
  assert.equal(host('.exemple.com'), 'exemple.com');
  assert.equal(host('*.exemple.com'), 'exemple.com');
  assert.equal(host('exemple.com # commentaire'), 'exemple.com');
});

test('URL completes, ports et format hosts', () => {
  assert.equal(host('http://exemple.com/jeux/index.html'), 'exemple.com');
  assert.equal(host('https://www.exemple.com:8080/a'), 'www.exemple.com');
  assert.equal(host('0.0.0.0 exemple.com'), 'exemple.com');
  assert.equal(host('127.0.0.1 exemple.com'), 'exemple.com');
});

test('les noms internationalises sont convertis en punycode', () => {
  assert.equal(host('jeux-en-ligne.fr'), 'jeux-en-ligne.fr');
  assert.equal(host('bücher.de'), 'xn--bcher-kva.de');

  // Plutot qu'une constante ecrite a la main, on verifie l'aller-retour via
  // l'implementation IDNA de reference de Node : le resultat est en ASCII et
  // redonne bien le nom d'origine en minuscules.
  const cyrillic = host('ЖИВОЙ.РФ');
  assert.match(cyrillic, /^xn--[a-z0-9-]+\.xn--[a-z0-9-]+$/);
  assert.equal(domainToUnicode(cyrillic), 'живой.рф');
});

test('rejets', () => {
  assert.equal(skip('192.168.1.1'), 'adresse IPv4');
  assert.equal(skip('localhost'), 'hostname sans point');
  assert.equal(skip(''), 'vide');
  assert.match(skip('[::1]'), /IPv6|invalide/);
});

test('normalizeList agrege et compte les rejets', () => {
  const result = normalizeList(['# commentaire', 'exemple.com', 'EXEMPLE.COM', '192.168.0.1', ''].join('\n'));
  assert.deepEqual([...result.hosts], ['exemple.com']);
  assert.equal(result.rawCount, 3);
  assert.equal(result.skipped.get('adresse IPv4'), 1);
});
