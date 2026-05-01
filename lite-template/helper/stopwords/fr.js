// French stopwords. Same role as en.js — filters high-frequency function
// words out of query keywords during retrieval scoring.
//
// All entries lowercase; the tokenizer lowercases input before lookup.
// Diacritics preserved (the tokenizer regex was fixed to use \p{L}\p{N}
// so "été", "où", "à" survive into the token stream).

module.exports = new Set([
  // Articles & determiners
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'au', 'aux',
  'ce', 'cet', 'cette', 'ces',
  // Possessives
  'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses',
  'notre', 'nos', 'votre', 'vos', 'leur', 'leurs',
  // Pronouns & relative pronouns
  'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles',
  'me', 'te', 'se', 'lui', 'eux', 'moi', 'toi', 'soi',
  'qui', 'que', 'quoi', 'dont', 'où',
  // Prepositions
  'à', 'dans', 'pour', 'avec', 'sans', 'sur', 'sous', 'par', 'vers',
  'chez', 'entre', 'depuis', 'pendant', 'avant', 'après',
  // Conjunctions
  'et', 'ou', 'mais', 'donc', 'car', 'ni', 'or',
  // Auxiliaries (être / avoir)
  'est', 'sont', 'suis', 'es', 'êtes', 'sommes', 'était', 'étaient',
  'ai', 'as', 'a', 'avons', 'avez', 'ont', 'avait', 'avaient', 'été',
  // Negation & high-frequency adverbs
  'ne', 'pas', 'plus', 'non', 'très', 'bien', 'aussi', 'encore',
  'toujours', 'jamais', 'déjà', 'même',
  // Interrogatives & comparatives
  'comment', 'pourquoi', 'quand', 'comme', 'quel', 'quelle', 'quels', 'quelles',
  // Common modal/light verbs (forms most likely to surface in queries)
  'peut', 'peuvent', 'doit', 'doivent', 'veut', 'veulent', 'fait', 'font',
]);
