// German stopwords. Same role as en.js / fr.js / es.js — filters
// high-frequency function words out of query keywords during retrieval scoring.
//
// All entries lowercase; the tokenizer lowercases input before lookup.
// Umlauts and ß preserved (ä, ö, ü, ß) — the tokenizer uses
// \p{L}\p{N} so those characters survive into the token stream.
//
// Note on case: German nouns are normally capitalized (e.g., "Haus"), but
// because the tokenizer lowercases before stopword lookup, only function-word
// forms appear here. The few content nouns that do show up (e.g., "mal") are
// listed because they're stopword-like in practice.

module.exports = new Set([
  // Articles & determiners (nominative / accusative / dative / genitive)
  'der', 'die', 'das', 'den', 'dem', 'des',
  'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  'kein', 'keine', 'keinen', 'keinem', 'keiner', 'keines',
  // Demonstratives
  'dieser', 'diese', 'dieses', 'diesen', 'diesem',
  'jener', 'jene', 'jenes', 'jenen', 'jenem',
  // Possessives
  'mein', 'meine', 'meinen', 'meinem', 'meiner', 'meines',
  'dein', 'deine', 'deinen', 'deinem', 'deiner', 'deines',
  'sein', 'seine', 'seinen', 'seinem', 'seiner', 'seines',
  'ihr', 'ihre', 'ihren', 'ihrem', 'ihrer', 'ihres',
  'unser', 'unsere', 'unseren', 'unserem', 'unserer', 'unseres',
  'euer', 'eure', 'euren', 'eurem', 'eurer', 'eures',
  // Personal pronouns
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr',
  'mich', 'dich', 'ihn', 'uns', 'euch',
  'mir', 'dir', 'ihm', 'ihnen',
  // Relative / interrogative pronouns
  'wer', 'wen', 'wem', 'wessen',
  'was', 'welcher', 'welche', 'welches', 'welchen', 'welchem',
  'wo', 'wohin', 'woher', 'wann', 'wie', 'warum', 'weshalb', 'wieso',
  // Prepositions
  'an', 'auf', 'aus', 'bei', 'bis', 'durch', 'für', 'gegen',
  'in', 'mit', 'nach', 'ohne', 'über', 'um', 'unter', 'von',
  'vor', 'zu', 'zur', 'zum', 'zwischen', 'seit', 'wegen', 'während',
  'gegenüber', 'innerhalb', 'außerhalb', 'trotz',
  // Conjunctions
  'und', 'oder', 'aber', 'denn', 'sondern', 'doch',
  'weil', 'da', 'dass', 'daß', 'ob', 'wenn', 'als',
  'damit', 'obwohl', 'obgleich', 'sobald', 'solange',
  // Auxiliaries — sein, haben, werden (most common forms)
  'sein', 'bin', 'bist', 'ist', 'sind', 'seid',
  'war', 'warst', 'waren', 'wart', 'gewesen',
  'haben', 'habe', 'hast', 'hat', 'habt', 'hatte', 'hattest', 'hatten', 'hattet', 'gehabt',
  'werden', 'werde', 'wirst', 'wird', 'werdet', 'wurde', 'wurdest', 'wurden', 'wurdet', 'geworden', 'worden',
  // Modal verbs (most common forms)
  'können', 'kann', 'kannst', 'könnt', 'konnte', 'konnten', 'könnte', 'könnten',
  'müssen', 'muss', 'musst', 'müsst', 'musste', 'mussten', 'müsste', 'müssten',
  'sollen', 'soll', 'sollst', 'sollt', 'sollte', 'sollten',
  'wollen', 'will', 'willst', 'wollt', 'wollte', 'wollten',
  'dürfen', 'darf', 'darfst', 'dürft', 'durfte', 'durften',
  'mögen', 'mag', 'magst', 'mögt', 'mochte', 'mochten', 'möchte', 'möchten',
  // Negation & high-frequency adverbs
  'nicht', 'nein', 'ja', 'doch', 'kein',
  'auch', 'noch', 'schon', 'nur', 'mehr', 'weniger',
  'sehr', 'ganz', 'ziemlich', 'etwa', 'fast',
  'immer', 'nie', 'niemals', 'manchmal', 'oft',
  'hier', 'dort', 'da', 'so', 'mal',
  // Quantifiers / indefinites
  'alle', 'alles', 'allen', 'allem', 'aller',
  'einige', 'einigen', 'manche', 'manchen',
  'viele', 'vielen', 'wenig', 'wenige', 'wenigen',
  'jeder', 'jede', 'jedes', 'jeden', 'jedem',
  'man', 'jemand', 'niemand', 'etwas', 'nichts',
]);
