"""
preprocessor.py  (v3 - Deep Fix)
──────────────────────────────────
Root cause fixes:
  1. Tech-aware stopword list: removed "use", "work", "make", "get", "go",
     "back" etc. that were incorrectly stripping meaningful resume verbs.
     Added TECH_PRESERVE list — tokens that must NEVER be removed.
  2. Normalise keeps alphanumeric + # + + . / (for C#, C++, Node.js, ci/cd)
  3. Bigram generation preserved over stopword-filtered list (not stemmed)
     so "machine learning" stays intact as a bigram
  4. Skill-aware tokenizer: treats "c++", "c#", "node.js" as single tokens
"""

import re
import string
import unicodedata
from collections import Counter

# ─── TECH-PRESERVE (never removed as stopwords) ──────────────────────────────
TECH_PRESERVE = frozenset([
    "c", "r", "go", "sql", "ai", "ml", "dl", "cv", "bi",
    "aws", "gcp", "ios", "api", "sdk", "cli", "orm", "oop",
    "tdd", "bdd", "mvc", "git",
])

# ─── STOPWORDS (conservative — only true function words) ─────────────────────
# Deliberately removed words like "use", "work", "get", "make", "like",
# "good", "need", "way", "well", "even", "back" — these appear in resumes
# as meaningful context words. Kept only true structural stopwords.
STOPWORDS = frozenset([
    "i", "me", "my", "myself", "we", "our", "ours", "ourselves",
    "you", "your", "yours", "yourself", "yourselves",
    "he", "him", "his", "himself", "she", "her", "hers", "herself",
    "it", "its", "itself", "they", "them", "their", "theirs", "themselves",
    "what", "which", "who", "whom", "this", "that", "these", "those",
    "am", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "having", "do", "does", "did", "doing",
    "a", "an", "the", "and", "but", "if", "or", "because", "as",
    "until", "while", "of", "at", "by", "for", "with", "about",
    "against", "between", "into", "through", "during", "before",
    "after", "above", "below", "to", "from", "up", "down",
    "in", "out", "on", "off", "over", "under", "again", "further",
    "then", "once", "here", "there", "when", "where", "why", "how",
    "all", "both", "each", "few", "more", "most", "other", "some",
    "such", "no", "nor", "not", "only", "own", "same", "so", "than",
    "too", "very", "s", "t", "can", "will", "just", "should", "now",
    "d", "ll", "m", "o", "re", "ve", "y",
    "also", "would", "could", "may", "might", "shall",
    # Resume boilerplate
    "responsible", "responsibilities", "including", "include", "etc",
    "eg", "ie", "per", "via", "within", "across", "without",
]) - TECH_PRESERVE  # Never remove tech tokens


# ─── PORTER STEMMER ───────────────────────────────────────────────────────────
class PorterStemmer:
    STEP1A = [("sses", "ss"), ("ies", "i"), ("ss", "ss"), ("s", "")]
    STEP1B1 = [("eed", "ee")]
    STEP1B2 = [("ed", ""), ("ing", "")]
    STEP2 = [
        ("ational", "ate"), ("tional", "tion"), ("enci", "ence"),
        ("anci", "ance"), ("izer", "ize"), ("abli", "able"), ("alli", "al"),
        ("entli", "ent"), ("eli", "e"), ("ousli", "ous"), ("ization", "ize"),
        ("ation", "ate"), ("ator", "ate"), ("alism", "al"), ("iveness", "ive"),
        ("fulness", "ful"), ("ousness", "ous"), ("aliti", "al"), ("iviti", "ive"),
        ("biliti", "ble"),
    ]
    STEP3 = [
        ("icate", "ic"), ("ative", ""), ("alize", "al"), ("iciti", "ic"),
        ("ical", "ic"), ("ful", ""), ("ness", ""),
    ]
    STEP4 = [
        "al", "ance", "ence", "er", "ic", "able", "ible", "ant", "ement",
        "ment", "ent", "ou", "ism", "ate", "iti", "ous", "ive", "ize",
    ]

    def _vowel(self, c): return c in "aeiou"
    def _cons(self, word, i):
        return not self._vowel(word[i]) if word[i] != "y" else (i == 0 or not self._cons(word, i - 1))

    def _m(self, stem):
        n, i, l = 0, 0, len(stem)
        while i < l:
            if not self._cons(stem, i): break
            i += 1
        while i < l:
            while i < l and not self._cons(stem, i): i += 1
            while i < l and self._cons(stem, i): i += 1
            n += 1
        return n

    def _has_vowel(self, stem):
        return any(not self._cons(stem, i) for i in range(len(stem)))

    def stem(self, word):
        if len(word) <= 2:
            return word
        # Protect tech tokens from stemming
        if word in TECH_PRESERVE:
            return word
        word = word.lower()
        for suf, rep in self.STEP1A:
            if word.endswith(suf):
                word = word[:-len(suf)] + rep; break
        replaced = False
        for suf, rep in self.STEP1B1:
            if word.endswith(suf) and self._m(word[:-len(suf)]) > 0:
                word = word[:-len(suf)] + rep; replaced = True; break
        if not replaced:
            for suf, rep in self.STEP1B2:
                if word.endswith(suf) and self._has_vowel(word[:-len(suf)]):
                    word = word[:-len(suf)] + rep
                    if word.endswith(("at", "bl", "iz")): word += "e"
                    elif len(word) > 1 and word[-1] == word[-2] and word[-1] not in "lsz": word = word[:-1]
                    break
        if word.endswith("y") and len(word) > 2 and self._has_vowel(word[:-1]):
            word = word[:-1] + "i"
        for suf, rep in self.STEP2:
            if word.endswith(suf) and self._m(word[:-len(suf)]) > 0:
                word = word[:-len(suf)] + rep; break
        for suf, rep in self.STEP3:
            if word.endswith(suf) and self._m(word[:-len(suf)]) > 0:
                word = word[:-len(suf)] + rep; break
        for suf in self.STEP4:
            if word.endswith(suf) and self._m(word[:-len(suf)]) > 1:
                word = word[:-len(suf)]; break
        return word


class RuleBasedLemmatizer:
    VERB_RULES = [
        (r"(\w+)ing$", lambda m: m.group(1)),
        (r"(\w+)(e)ing$", lambda m: m.group(1) + "e"),
        (r"(\w+)ed$", lambda m: m.group(1)),
        (r"(\w+)(e)d$", lambda m: m.group(1) + "e"),
        (r"(\w+)ies$", lambda m: m.group(1) + "y"),
    ]
    NOUN_RULES = [
        (r"(\w+)ies$", lambda m: m.group(1) + "y"),
        (r"(\w+)ves$", lambda m: m.group(1) + "f"),
        (r"(\w+)ses$", lambda m: m.group(1) + "s"),
        (r"(\w+)es$", lambda m: m.group(1)),
        (r"(\w+)s$", lambda m: m.group(1)),
    ]
    IRREGULAR = {
        "was": "be", "were": "be", "been": "be", "is": "be", "are": "be",
        "had": "have", "has": "have", "did": "do", "does": "do",
        "ran": "run", "built": "build", "wrote": "write", "led": "lead",
        "developed": "develop", "managed": "manage", "designed": "design",
        "implemented": "implement", "deployed": "deploy", "created": "create",
        "maintained": "maintain", "improved": "improve", "optimized": "optimize",
    }

    def lemmatize(self, word: str, pos: str = "n") -> str:
        word = word.lower()
        if word in TECH_PRESERVE:
            return word
        if word in self.IRREGULAR:
            return self.IRREGULAR[word]
        rules = self.VERB_RULES if pos == "v" else self.NOUN_RULES
        for pattern, replacement in rules:
            m = re.match(pattern, word)
            if m and len(m.group(1)) > 2:
                return replacement(m)
        return word


_stemmer = PorterStemmer()
_lemmatizer = RuleBasedLemmatizer()


def normalize_text(text: str) -> str:
    """
    Normalise preserving tech chars: #, +, ., /
    e.g. C# -> c#, C++ -> c++, Node.js -> node.js, CI/CD -> ci/cd
    """
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    # Keep alphanumeric plus tech chars: # + . / -
    text = re.sub(r"[^a-z0-9\s#+./\-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def tokenize(text: str) -> list[str]:
    """
    Tech-aware tokenizer. Treats multi-char tech tokens as single units:
      c++, c#, node.js, asp.net, ci/cd, .net
    """
    text = normalize_text(text)
    # Special tech tokens first (order matters — longer first)
    _TECH_TOKENS = [
        r"node\.js", r"asp\.net", r"\.net", r"c\+\+", r"c#", r"ci/cd",
        r"scikit-learn", r"sk-learn", r"co-pilot", r"github\.com",
    ]
    # Tokenize with tech awareness
    tech_pattern = "|".join(_TECH_TOKENS)
    tokens = []
    remaining = text
    for match in re.finditer(tech_pattern + r"|[a-z][a-z0-9#+./\-]{1,}", remaining):
        tok = match.group()
        if len(tok) >= 2 or tok in TECH_PRESERVE:
            tokens.append(tok)
    return tokens


def remove_stopwords(tokens: list[str]) -> list[str]:
    return [t for t in tokens if (t not in STOPWORDS or t in TECH_PRESERVE) and len(t) >= 1]


def stem_tokens(tokens: list[str]) -> list[str]:
    return [_stemmer.stem(t) if t not in TECH_PRESERVE else t for t in tokens]


def lemmatize_tokens(tokens: list[str], pos: str = "n") -> list[str]:
    return [_lemmatizer.lemmatize(t, pos) if t not in TECH_PRESERVE else t for t in tokens]


def generate_ngrams(tokens: list[str], n: int = 2) -> list[str]:
    return ["_".join(tokens[i:i+n]) for i in range(len(tokens) - n + 1)]


def full_pipeline(text: str, use_stemming: bool = True) -> dict:
    """
    Full NLP pipeline returning each stage's output.
    Key fix: bigrams generated from no_stop (pre-stemming) so
    "machine_learning" is preserved rather than "machin_learn".
    """
    raw = text or ""
    normalized = normalize_text(raw)
    tokens = tokenize(raw)
    no_stop = remove_stopwords(tokens)
    # Bigrams from no_stop (BEFORE stemming to preserve skill phrases)
    bigrams = generate_ngrams(no_stop, 2)
    trigrams = generate_ngrams(no_stop, 3)
    lemmatized = lemmatize_tokens(no_stop)
    stemmed = stem_tokens(lemmatized) if use_stemming else lemmatized
    term_freq = Counter(stemmed)

    return {
        "raw_length": len(raw),
        "normalized": normalized[:300],
        "tokens": tokens,
        "tokens_count": len(tokens),
        "after_stopword_removal": no_stop,
        "stopwords_removed": len(tokens) - len(no_stop),
        "lemmatized": lemmatized,
        "stemmed": stemmed,
        "bigrams": bigrams[:30],
        "trigrams": trigrams[:15],
        "term_frequency": dict(term_freq.most_common(25)),
        "unique_terms": len(set(stemmed)),
        "vocabulary_richness": round(len(set(stemmed)) / max(len(stemmed), 1), 4),
    }


def parse_skill_list(raw: str) -> list[str]:
    """Parse Python-like list strings or comma-separated: \"['Python', 'Java']\" -> ['Python', 'Java']"""
    if not raw or raw in ("None", "N/A", "[]", ""):
        return []
    try:
        cleaned = raw.strip()
        cleaned = re.sub(r"^['\"]|['\"]$", "", cleaned.strip("[]"))
        items = re.split(r"['\"],\s*['\"]", cleaned)
        result = []
        for item in items:
            item = item.strip().strip("'\"").strip()
            if item and item not in ("None", "N/A"):
                result.append(item)
        return result
    except Exception:
        return [s.strip() for s in raw.replace("[", "").replace("]", "").split(",") if s.strip()]
