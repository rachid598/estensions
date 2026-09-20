/**
 * Normalisation des hostnames issus des listes amont.
 *
 * Les listes UT1 contiennent essentiellement des hostnames nus, mais aussi des
 * lignes avec schema, chemin, port, point final ou caracteres non-ASCII. Tout
 * doit converger vers une forme unique et comparable : minuscules, punycode,
 * sans point final.
 */

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const LABEL = /^[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?$/;

/**
 * @param {string} rawLine une ligne de liste amont
 * @returns {{ host: string } | { skip: string }} le hostname normalise, ou la raison du rejet
 */
export function normalizeHost(rawLine) {
  let value = rawLine;

  // Commentaires (`#` en debut de ligne ou en fin) et espaces.
  const hash = value.indexOf('#');
  if (hash !== -1) value = value.slice(0, hash);
  value = value.trim();
  if (value === '') return { skip: 'vide' };

  // Format `hosts` : "0.0.0.0 exemple.com" ou "127.0.0.1 exemple.com".
  const parts = value.split(/\s+/);
  if (parts.length > 1 && (parts[0] === '0.0.0.0' || parts[0] === '127.0.0.1' || parts[0] === '::1')) {
    value = parts[1];
  } else if (parts.length > 1) {
    return { skip: 'ligne multi-champs inattendue' };
  }

  // Un `*.` de tete est redondant : un hostname bloque couvre deja ses sous-domaines.
  if (value.startsWith('*.')) value = value.slice(2);
  // Un point de tete (format `.exemple.com`) l'est aussi.
  if (value.startsWith('.')) value = value.slice(1);

  let host;
  try {
    // `new URL` se charge du punycode, de la casse et du retrait du port.
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;
    host = new URL(withScheme).hostname;
  } catch {
    return { skip: 'hostname invalide' };
  }

  // Point final absolu.
  if (host.endsWith('.')) host = host.slice(0, -1);
  host = host.toLowerCase();

  if (host === '') return { skip: 'hostname vide' };
  if (host.startsWith('[')) return { skip: 'adresse IPv6' };
  if (IPV4.test(host)) return { skip: 'adresse IPv4' };
  if (!host.includes('.')) return { skip: 'hostname sans point' };
  if (host.length > 253) return { skip: 'hostname trop long' };

  for (const label of host.split('.')) {
    if (label.length === 0 || label.length > 63) return { skip: 'label de longueur invalide' };
    if (!LABEL.test(label)) return { skip: 'label aux caracteres invalides' };
  }

  return { host };
}

/**
 * Normalise un fichier entier, en agregeant les motifs de rejet.
 * @returns {{ hosts: Set<string>, rawCount: number, skipped: Map<string, number> }}
 */
export function normalizeList(text) {
  const hosts = new Set();
  const skipped = new Map();
  let rawCount = 0;

  for (const line of text.split('\n')) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    rawCount += 1;
    const result = normalizeHost(line);
    if ('host' in result) hosts.add(result.host);
    else skipped.set(result.skip, (skipped.get(result.skip) ?? 0) + 1);
  }

  return { hosts, rawCount, skipped };
}
