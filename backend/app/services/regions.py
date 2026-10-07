"""Canonical region-name normalization and matching.

Two divergent copies of this used to exist (crud.py and services/lines.py).
crud.py's version stripped non-ASCII characters via `re.sub(r"[^a-z0-9]+",
"", s)`, which collapses an all-Bengali region name (e.g. "ঢাকা", "চহরিপজ") to the
empty string -- region_matches then hits its empty-key guard and returns
False, so a line against such a region silently never finds its rate and
keeps amount 0. `str.isalnum()` is Unicode-aware and does not have this
bug, so it is the one kept here. (crud.py's copy was also otherwise dead
code -- see git history.)
"""

ALIASES = {
    "cumilla": "comilla",
    "chittagong": "chattogram",
}


def normalize_region_key(region: str | None) -> str:
    value = str(region or "").strip().lower()
    value = " ".join(value.split())
    for old, new in ALIASES.items():
        value = value.replace(old, new)
    return "".join(ch for ch in value if ch.isalnum())


def region_matches(left: str | None, right: str | None) -> bool:
    left_key = normalize_region_key(left)
    right_key = normalize_region_key(right)
    if not left_key or not right_key:
        return False
    return left_key == right_key or left_key in right_key or right_key in left_key
