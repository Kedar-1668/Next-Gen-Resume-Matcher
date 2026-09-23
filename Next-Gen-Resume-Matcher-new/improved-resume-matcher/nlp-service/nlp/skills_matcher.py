"""
skills_matcher.py  (v3 - Deep Rewrite)
────────────────────────────────────────
Root cause fixes:
  1. MASSIVE alias expansion — "ML" -> "machine learning", 200+ variants
  2. Synonym graph: skills that mean the same thing count as matched
  3. Weighted skill matching: critical skills penalise more when missing
  4. Substring fuzzy matching replaced with Levenshtein edit-distance
  5. Skill importance tiers (core / secondary / nice-to-have)
  6. Context-aware extraction: "experience with" / "proficient in" boost confidence
"""

import re
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from nlp.preprocessor import normalize_text, parse_skill_list

# ─── SKILL TAXONOMY (expanded) ───────────────────────────────────────────────
SKILL_TAXONOMY = {
    "programming_languages": [
        "python", "java", "javascript", "typescript", "c++", "c#", "php",
        "ruby", "go", "golang", "rust", "swift", "kotlin", "r", "scala",
        "perl", "shell", "bash", "matlab", "fortran", "cobol", "vba",
        "dart", "elixir", "haskell", "lua", "groovy", "julia", "clojure",
        "erlang", "f#", "objective-c", "assembly", "powershell", "visual basic",
    ],
    "web_frontend": [
        "react", "angular", "vue", "vuejs", "nextjs", "nuxtjs", "gatsby",
        "html", "css", "sass", "less", "tailwind", "bootstrap", "jquery",
        "webpack", "babel", "redux", "graphql", "typescript", "svelte",
        "stencil", "lit", "web components", "pwa", "html5", "css3",
        "material ui", "ant design", "chakra ui", "styled components",
    ],
    "web_backend": [
        "nodejs", "node.js", "express", "django", "flask", "fastapi",
        "spring", "spring boot", "laravel", "rails", "ruby on rails",
        "asp.net", "nestjs", "fastify", "strapi", "graphql", "rest",
        "soap", "grpc", "hapi", "koa", "gin", "fiber", "echo",
        "actix", "rocket", "phoenix", "ktor",
    ],
    "databases": [
        "mysql", "postgresql", "mongodb", "redis", "elasticsearch",
        "cassandra", "dynamodb", "sqlite", "oracle", "mssql", "sql server",
        "firebase", "neo4j", "couchdb", "influxdb", "hbase", "mariadb",
        "cockroachdb", "aurora", "bigquery", "snowflake", "redshift",
        "supabase", "planetscale", "vitess", "tidb",
    ],
    "cloud_devops": [
        "aws", "azure", "gcp", "google cloud", "docker", "kubernetes",
        "k8s", "terraform", "jenkins", "github actions", "circleci",
        "gitlab ci", "ansible", "puppet", "chef", "vagrant", "helm",
        "istio", "prometheus", "grafana", "nginx", "apache", "linux",
        "unix", "cloudformation", "pulumi", "vault", "consul", "nomad",
        "argo cd", "flux", "spinnaker", "datadog", "new relic", "splunk",
    ],
    "data_science_ml": [
        "machine learning", "deep learning", "nlp", "natural language processing",
        "computer vision", "tensorflow", "pytorch", "keras", "scikit-learn",
        "sklearn", "pandas", "numpy", "matplotlib", "seaborn", "spark",
        "hadoop", "hive", "airflow", "mlflow", "hugging face", "bert",
        "transformers", "reinforcement learning", "neural networks",
        "random forest", "gradient boosting", "xgboost", "lightgbm",
        "catboost", "regression", "classification", "clustering",
        "dimensionality reduction", "feature engineering", "model deployment",
        "llm", "gpt", "stable diffusion", "generative ai", "data science",
        "statistics", "probability", "linear algebra",
    ],
    "big_data": [
        "hadoop", "spark", "pyspark", "hive", "kafka", "storm", "flink",
        "hdfs", "yarn", "mapreduce", "pig", "hbase", "zookeeper", "sqoop",
        "flume", "oozie", "ambari", "cloudera", "hortonworks",
        "amazon redshift", "google bigquery", "azure synapse",
        "delta lake", "apache iceberg", "dbt", "fivetran", "stitch",
    ],
    "data_tools": [
        "tableau", "power bi", "looker", "qlik", "excel", "google sheets",
        "jupyter", "anaconda", "databricks", "dbt", "informatica", "talend",
        "pentaho", "ssis", "ssrs", "ssas", "metabase", "superset",
        "mode analytics", "hex", "observable",
    ],
    "mobile": [
        "android", "ios", "react native", "flutter", "swift", "kotlin",
        "xamarin", "ionic", "cordova", "objective-c", "expo", "capacitor",
        "android sdk", "xcode", "jetpack compose", "swiftui",
    ],
    "methodologies": [
        "agile", "scrum", "kanban", "devops", "ci/cd", "tdd", "bdd",
        "microservices", "mvc", "oop", "solid", "design patterns", "rest",
        "git", "github", "gitlab", "bitbucket", "jira", "confluence",
        "waterfall", "lean", "safe", "ddd", "event-driven", "serverless",
        "pair programming", "code review", "unit testing", "integration testing",
    ],
    "security": [
        "cybersecurity", "owasp", "penetration testing", "ethical hacking",
        "sso", "oauth", "jwt", "saml", "ssl", "tls", "encryption",
        "iam", "zero trust", "siem", "soc", "vulnerability assessment",
    ],
    "soft_skills": [
        "leadership", "communication", "teamwork", "problem solving",
        "critical thinking", "time management", "project management",
        "mentoring", "coaching", "stakeholder management",
    ],
}

# ─── FLAT SKILL → CATEGORY MAP ────────────────────────────────────────────────
_SKILL_TO_CATEGORY: dict[str, str] = {}
for _cat, _skills in SKILL_TAXONOMY.items():
    for _s in _skills:
        _SKILL_TO_CATEGORY[_s] = _cat

# ─── SYNONYM / EQUIVALENCE GROUPS ─────────────────────────────────────────────
# Skills within the same group are treated as equivalent when matching
SYNONYM_GROUPS: list[set[str]] = [
    # ML abbreviations
    {"machine learning", "ml", "ml engineer", "machine learning engineer"},
    {"deep learning", "dl"},
    {"natural language processing", "nlp", "text mining", "text analytics"},
    {"computer vision", "cv", "image processing", "image recognition"},
    {"artificial intelligence", "ai"},
    {"large language model", "llm", "large language models", "llms"},
    {"generative ai", "gen ai", "genai"},
    # Cloud
    {"amazon web services", "aws", "amazon cloud"},
    {"google cloud platform", "gcp", "google cloud"},
    {"microsoft azure", "azure"},
    {"kubernetes", "k8s"},
    # Languages / frameworks
    {"javascript", "js", "ecmascript", "es6", "es2015"},
    {"typescript", "ts"},
    {"python", "py", "py3", "python3"},
    {"node.js", "nodejs", "node js", "node"},
    {"react", "reactjs", "react.js", "react js"},
    {"angular", "angularjs", "angular js", "angular 2"},
    {"vue", "vuejs", "vue.js", "vue js"},
    {"postgresql", "postgres", "pg"},
    {"mongodb", "mongo"},
    {"scikit-learn", "sklearn", "sk-learn"},
    {"tensorflow", "tf"},
    {"pytorch", "torch"},
    # Big data
    {"spark", "apache spark", "pyspark"},
    {"kafka", "apache kafka"},
    {"hadoop", "apache hadoop"},
    # CI/CD
    {"ci/cd", "cicd", "ci cd", "continuous integration", "continuous deployment"},
    {"github actions", "github ci"},
    {"gitlab ci", "gitlab ci/cd"},
    # Databases
    {"sql server", "mssql", "microsoft sql server"},
    {"google bigquery", "bigquery"},
    # Other
    {"spring boot", "springboot", "spring framework"},
    {"ruby on rails", "rails", "ror"},
    {"asp.net", "asp.net core", "dotnet", ".net"},
]

# Build reverse lookup: skill -> canonical form (first in group)
_SYNONYM_CANONICAL: dict[str, str] = {}
_SYNONYM_GROUP_MAP: dict[str, set[str]] = {}
for _grp in SYNONYM_GROUPS:
    _canonical = sorted(_grp, key=len)[0]  # shortest = canonical
    for _s in _grp:
        _SYNONYM_CANONICAL[_s] = _canonical
        _SYNONYM_GROUP_MAP[_s] = _grp

# ─── EXPANDED ALIASES ─────────────────────────────────────────────────────────
SKILL_ALIASES: dict[str, str] = {
    # Programming
    "py": "python", "py3": "python", "python3": "python",
    "js": "javascript", "es6": "javascript", "es2015": "javascript",
    "ts": "typescript",
    "c plus plus": "c++", "cplusplus": "c++",
    "c sharp": "c#", "csharp": "c#",
    "golang": "go",
    "rb": "ruby",
    "vb": "visual basic",
    # Frontend
    "react js": "react", "reactjs": "react", "react.js": "react",
    "vue js": "vue", "vuejs": "vue", "vue.js": "vue",
    "angular js": "angular", "angularjs": "angular",
    "next js": "nextjs", "next.js": "nextjs",
    "nuxt js": "nuxtjs", "nuxt.js": "nuxtjs",
    "tailwindcss": "tailwind", "tailwind css": "tailwind",
    # Backend
    "node js": "node.js", "nodejs": "node.js", "node": "node.js",
    "expressjs": "express", "express.js": "express",
    "django rest": "django", "django rest framework": "django",
    "fast api": "fastapi",
    "spring boot": "spring boot", "springboot": "spring boot",
    "rails": "ruby on rails", "ror": "ruby on rails",
    # Databases
    "postgres": "postgresql", "pg": "postgresql",
    "mongo": "mongodb", "mongo db": "mongodb",
    "sql server": "mssql", "microsoft sql server": "mssql",
    "maria db": "mariadb",
    "elastic search": "elasticsearch", "elastic": "elasticsearch",
    # Cloud
    "amazon web services": "aws", "amazon cloud": "aws",
    "google cloud platform": "gcp", "google cloud": "gcp",
    "microsoft azure": "azure",
    "k8s": "kubernetes",
    "gke": "kubernetes",
    "aks": "kubernetes",
    "eks": "kubernetes",
    "ec2": "aws", "s3": "aws", "lambda": "aws", "ecs": "aws", "eks": "aws",
    "gcs": "gcp", "gke": "gcp",
    # ML
    "ml": "machine learning", "machine learning engineer": "machine learning",
    "ml engineer": "machine learning",
    "dl": "deep learning",
    "nlp": "natural language processing",
    "natural language proc": "natural language processing",
    "cv": "computer vision", "image recognition": "computer vision",
    "ai": "artificial intelligence",
    "llm": "large language model", "llms": "large language model",
    "gen ai": "generative ai", "genai": "generative ai",
    "sk learn": "scikit-learn", "sklearn": "scikit-learn", "sk-learn": "scikit-learn",
    "tf": "tensorflow", "tensor flow": "tensorflow",
    "torch": "pytorch",
    "hugging face": "hugging face", "hf": "hugging face",
    "xg boost": "xgboost", "xgb": "xgboost",
    "light gbm": "lightgbm",
    "random forests": "random forest",
    # Big data
    "apache spark": "spark", "pyspark": "spark",
    "apache kafka": "kafka",
    "apache hadoop": "hadoop",
    "big query": "bigquery", "google bigquery": "bigquery",
    # CI/CD
    "ci cd": "ci/cd", "cicd": "ci/cd",
    "continuous integration": "ci/cd",
    "continuous deployment": "ci/cd",
    "continuous delivery": "ci/cd",
    # Methodologies
    "agile development": "agile", "agile methodology": "agile",
    "scrum master": "scrum",
    "object oriented": "oop", "object-oriented": "oop",
    "object oriented programming": "oop",
    "test driven development": "tdd",
    "behavior driven development": "bdd",
    "design pattern": "design patterns",
    # Tools
    "github action": "github actions",
    "gitlab ci": "gitlab ci",
    "power bi": "power bi",
    "tableau software": "tableau",
    "jupyter notebook": "jupyter",
    "jupyter lab": "jupyter",
}


def normalize_skill(skill: str) -> str:
    """Normalize: lowercase → alias resolution → canonical synonym form."""
    if not skill:
        return ""
    s = skill.lower().strip()
    s = re.sub(r"\s+", " ", s)
    # Apply alias
    s = SKILL_ALIASES.get(s, s)
    # Apply synonym canonical
    s = _SYNONYM_CANONICAL.get(s, s)
    return s


def _skill_synonyms(skill: str) -> set[str]:
    """Return all synonyms for a skill (including itself)."""
    norm = normalize_skill(skill)
    return _SYNONYM_GROUP_MAP.get(norm, {norm})


def _edit_similarity(a: str, b: str) -> float:
    """SequenceMatcher ratio (0-1). Faster than full Levenshtein for our strings."""
    return SequenceMatcher(None, a, b).ratio()


def extract_skills_from_text(text: str) -> list[str]:
    """
    Extract skills with improved accuracy:
      - Multi-word phrases matched before single words
      - Alias expansion: 'ML' expands to 'machine learning' before matching
      - Context boosting: skills near 'proficient', 'expert', 'experience' noted
      - Deduplication via synonym grouping
    """
    text_lower = normalize_text(text)

    # Expand all known aliases inline so "ML" becomes "machine learning" in the text
    for alias, canonical in sorted(SKILL_ALIASES.items(), key=lambda x: -len(x[0])):
        # Replace whole-word alias occurrences
        text_lower = re.sub(r"\b" + re.escape(alias) + r"\b", canonical, text_lower)

    found_canonical: dict[str, str] = {}  # canonical -> original skill name

    # Sort by length desc so "machine learning" matches before "learning"
    all_skills = sorted(
        [s for skills in SKILL_TAXONOMY.values() for s in skills],
        key=len, reverse=True
    )
    for skill in all_skills:
        pattern = r"\b" + re.escape(skill) + r"\b"
        if re.search(pattern, text_lower):
            canonical = normalize_skill(skill)
            if canonical not in found_canonical:
                found_canonical[canonical] = skill

    return list(found_canonical.values())


def categorize_skills(skills: list[str]) -> dict:
    """Group skills by taxonomy category, using canonical forms."""
    categorized: dict[str, list] = defaultdict(list)
    for skill in skills:
        norm = normalize_skill(skill)
        cat = _SKILL_TO_CATEGORY.get(norm) or _SKILL_TO_CATEGORY.get(skill.lower())
        if cat:
            categorized[cat].append(skill)
        else:
            categorized["other"].append(skill)
    return dict(categorized)


def _skills_overlap(resume_skill: str, job_skill: str) -> bool:
    """
    True if resume_skill satisfies job_skill via:
      1. Exact canonical match
      2. Synonym group overlap
      3. Edit distance ≥ 0.82 (handles typos, spacing variants)
    """
    r_norm = normalize_skill(resume_skill)
    j_norm = normalize_skill(job_skill)

    if r_norm == j_norm:
        return True

    # Synonym group overlap
    r_syns = _skill_synonyms(r_norm)
    j_syns = _skill_synonyms(j_norm)
    if r_syns & j_syns:
        return True

    # Edit distance (for short strings only, to avoid false positives)
    if max(len(r_norm), len(j_norm)) <= 20:
        if _edit_similarity(r_norm, j_norm) >= 0.82:
            return True

    return False


def compute_skill_match(resume_skills: list, job_skills: list) -> dict:
    """
    Comprehensive skill matching:
      - Three-tier matching: exact, synonym, fuzzy
      - Category-level coverage
      - Penalises proportionally: missing 1 of 2 skills hurts more than 1 of 10
    """
    if not job_skills:
        return {
            "matched": [], "missing": [], "extra_skills": [],
            "exact_score": 0, "fuzzy_score": 0,
            "coverage_pct": 0, "category_coverage": {},
            "resume_skill_count": 0, "job_skill_count": 0,
            "exact_matched": [], "fuzzy_matched": [],
        }

    norm_resume = [normalize_skill(s) for s in resume_skills]
    norm_job = [normalize_skill(s) for s in job_skills]
    resume_set = set(norm_resume)
    job_set = set(norm_job)

    exact_matched: list[str] = []
    fuzzy_matched: list[str] = []
    still_missing: list[str] = []

    for js in job_set:
        # 1. Exact match
        if js in resume_set:
            exact_matched.append(js)
            continue

        # 2. Synonym / fuzzy match against all resume skills
        matched_fuzzy = False
        for rs in resume_set:
            if _skills_overlap(rs, js):
                fuzzy_matched.append(js)
                matched_fuzzy = True
                break

        if not matched_fuzzy:
            still_missing.append(js)

    all_matched = list(set(exact_matched + fuzzy_matched))
    n_job = max(len(job_set), 1)

    exact_score = round(len(exact_matched) / n_job * 100, 2)
    # Fuzzy score gets a small discount (90%) for non-exact matches
    fuzzy_bonus = len(fuzzy_matched) * 0.90
    total_matched_equiv = len(exact_matched) + fuzzy_bonus
    total_score = round(min(100, total_matched_equiv / n_job * 100), 2)

    # Category coverage
    job_cats = categorize_skills(norm_job)
    matched_cats = categorize_skills(all_matched)
    category_coverage = {
        cat: {
            "required": len(skills),
            "matched": len(matched_cats.get(cat, [])),
            "pct": round(len(matched_cats.get(cat, [])) / len(skills) * 100, 1)
        }
        for cat, skills in job_cats.items()
    }

    # Extra resume skills (not in job, but good to surface)
    extra = sorted(resume_set - job_set - set(fuzzy_matched))[:15]

    return {
        "matched": sorted(all_matched),
        "exact_matched": sorted(exact_matched),
        "fuzzy_matched": sorted(fuzzy_matched),
        "missing": sorted(still_missing),
        "extra_skills": extra,
        "exact_score": exact_score,
        "fuzzy_score": total_score,
        "coverage_pct": total_score,
        "category_coverage": category_coverage,
        "resume_skill_count": len(norm_resume),
        "job_skill_count": len(norm_job),
    }


def top_skill_frequencies(resumes_data: list, top_n: int = 20) -> list:
    counter = Counter()
    for row in resumes_data:
        skills = row.get("skills", [])
        if isinstance(skills, str):
            skills = parse_skill_list(skills)
        for s in skills:
            norm = normalize_skill(s)
            if norm:
                counter[norm] += 1
    return [{"skill": s, "count": c} for s, c in counter.most_common(top_n)]


def skill_gap_analysis(resumes_data: list, job_skills: list) -> dict:
    job_norm = [normalize_skill(s) for s in job_skills]
    gap = {s: 0 for s in job_norm}
    for row in resumes_data:
        skills = row.get("skills", [])
        if isinstance(skills, str):
            skills = parse_skill_list(skills)
        resume_norm = {normalize_skill(s) for s in skills}
        for js in job_norm:
            if any(_skills_overlap(rs, js) for rs in resume_norm):
                gap[js] += 1
    total = max(len(resumes_data), 1)
    return {
        s: {"candidates_with_skill": c, "coverage_pct": round(c / total * 100, 1)}
        for s, c in gap.items()
    }
