// Spanish stopwords. Same role as en.js / fr.js — filters high-frequency
// function words out of query keywords during retrieval scoring.
//
// All entries lowercase; the tokenizer lowercases input before lookup.
// Diacritics preserved (á, é, í, ó, ú, ñ) — the tokenizer uses
// \p{L}\p{N} so accented characters survive into the token stream.

module.exports = new Set([
  // Articles & determiners
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo',
  'al', 'del',
  // Demonstratives
  'este', 'esta', 'estos', 'estas', 'esto',
  'ese', 'esa', 'esos', 'esas', 'eso',
  'aquel', 'aquella', 'aquellos', 'aquellas', 'aquello',
  // Possessives
  'mi', 'mis', 'tu', 'tus', 'su', 'sus',
  'nuestro', 'nuestra', 'nuestros', 'nuestras',
  'vuestro', 'vuestra', 'vuestros', 'vuestras',
  // Pronouns
  'yo', 'tú', 'él', 'ella', 'usted', 'nosotros', 'nosotras',
  'vosotros', 'vosotras', 'ustedes', 'ellos', 'ellas',
  'me', 'te', 'se', 'le', 'les', 'nos', 'os',
  // Relative pronouns / interrogatives
  'que', 'qué', 'quien', 'quién', 'quienes', 'quiénes',
  'cual', 'cuál', 'cuales', 'cuáles', 'cuyo', 'cuya',
  'donde', 'dónde', 'cuando', 'cuándo', 'como', 'cómo',
  'cuanto', 'cuánto', 'cuanta', 'cuánta',
  // Prepositions
  'a', 'ante', 'bajo', 'con', 'contra', 'de', 'desde', 'en',
  'entre', 'hacia', 'hasta', 'para', 'por', 'según', 'sin',
  'sobre', 'tras', 'durante', 'mediante',
  // Conjunctions
  'y', 'e', 'o', 'u', 'ni', 'pero', 'mas', 'sino', 'aunque',
  'porque', 'pues', 'si', 'mientras',
  // Auxiliaries — ser, estar, haber (most common forms)
  'ser', 'soy', 'eres', 'es', 'somos', 'sois', 'son',
  'era', 'eras', 'éramos', 'erais', 'eran',
  'fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron',
  'estar', 'estoy', 'estás', 'está', 'estamos', 'estáis', 'están',
  'estaba', 'estabas', 'estaban',
  'haber', 'he', 'has', 'ha', 'hemos', 'habéis', 'han',
  'había', 'habían', 'hay',
  // Negation & high-frequency adverbs
  'no', 'sí', 'ya', 'muy', 'más', 'menos', 'también', 'tampoco',
  'solo', 'sólo', 'solamente', 'siempre', 'nunca', 'jamás',
  'todavía', 'aún', 'aquí', 'allí', 'ahí', 'así',
  // Common modal/light verbs (forms most likely to surface in queries)
  'puede', 'pueden', 'debe', 'deben', 'quiere', 'quieren',
  'hace', 'hacen', 'hacer',
]);
