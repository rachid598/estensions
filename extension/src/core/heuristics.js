/**
 * Score heuristique d'une page.
 *
 * Fonction pure : le detecteur releve des signaux, c'est ici qu'ils sont pesés.
 * Logique unique, donc testable sans navigateur.
 *
 * Regle de conception : le blocage exige TOUJOURS un signal de moteur ET un
 * signal lexical. Unity et Godot servent aussi a des simulations pedagogiques ;
 * un moteur de jeu seul ne doit jamais suffire a bloquer.
 */

/**
 * Recherche un mot-cle sur frontiere de mot plutot qu'en simple sous-chaine :
 * sans cela, « jeu » declencherait sur « enjeux-pedagogiques ».
 */
function containsKeyword(haystack, keyword) {
  const index = haystack.indexOf(keyword);
  if (index === -1) return false;

  const before = index === 0 ? '' : haystack[index - 1];
  const afterIndex = index + keyword.length;
  const after = afterIndex >= haystack.length ? '' : haystack[afterIndex];
  const isLetter = (character) => character !== '' && /[a-z0-9]/.test(character);

  return !isLetter(before) && !isLetter(after);
}

const matchesAny = (haystack, keywords) => keywords.some((keyword) => containsKeyword(haystack, keyword));

/**
 * @param {{ url?: string, title?: string, signals?: object, config: object }} input
 * @returns {{ score: number, shouldBlock: boolean, hasEngine: boolean,
 *   hasLexical: boolean, matched: string[] }}
 */
export function scorePage({ url = '', title = '', signals = {}, config }) {
  const haystackUrl = String(url).toLowerCase();
  const haystackTitle = String(title).toLowerCase();

  const present = {
    lexicalUrl: matchesAny(haystackUrl, config.lexical.urlKeywords),
    lexicalTitle: matchesAny(haystackTitle, config.lexical.titleKeywords),
    engineDom: signals.engineDom === true,
    engineGlobal: signals.engineGlobal === true,
    bigCanvas: signals.bigCanvas === true,
  };

  let score = 0;
  const matched = [];
  for (const [name, isPresent] of Object.entries(present)) {
    if (!isPresent) continue;
    score += config.weights[name] ?? 0;
    matched.push(name);
  }

  const hasEngine = present.engineDom || present.engineGlobal;
  const hasLexical = present.lexicalUrl || present.lexicalTitle;

  const meetsThreshold = score >= config.threshold;
  const meetsCombination = config.requireEngineAndLexical ? hasEngine && hasLexical : true;

  return { score, shouldBlock: meetsThreshold && meetsCombination, hasEngine, hasLexical, matched };
}
