"""Chainage parsing and formatting for road estimates.

Chainage is the running distance along a road, written ``km+metres`` -- so
``1+250`` is 1250 m from the start, and ``0+000`` is the origin. Road elements
are segments between two chainages, e.g. ``0+000 - 1+250``.
"""

import re
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException

# "1+250", "01+250", "1 + 250", "1+250.500"
_CHAINAGE_RE = re.compile(r"^\s*(\d+)\s*\+\s*(\d+(?:\.\d+)?)\s*$")
# A bare distance in metres: "1250", "1250.5"
_PLAIN_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*$")

_METRES_PER_KM = Decimal(1000)
_QUANT = Decimal("0.001")


def parse_chainage(value) -> Decimal:
    """Parse ``"1+250"`` (or a bare ``1250``) into metres as a Decimal.

    Rejects a metre-part of 1000 or more: ``1+1250`` is a typo, not 2250.
    """
    if value is None or value == "":
        raise HTTPException(status_code=400, detail="chainage_required")
    if isinstance(value, (int, float, Decimal)):
        text = str(value)
    else:
        text = str(value)

    match = _CHAINAGE_RE.match(text)
    if match:
        km_part, metre_part = match.group(1), match.group(2)
        metres = Decimal(metre_part)
        if metres >= _METRES_PER_KM:
            raise HTTPException(
                status_code=400,
                detail=f"invalid_chainage: metre part of '{text.strip()}' must be less than 1000",
            )
        return (Decimal(km_part) * _METRES_PER_KM + metres).quantize(_QUANT)

    plain = _PLAIN_RE.match(text)
    if plain:
        try:
            return Decimal(plain.group(1)).quantize(_QUANT)
        except InvalidOperation:
            pass

    raise HTTPException(
        status_code=400,
        detail=f"invalid_chainage: '{text.strip()}' is not a chainage like 1+250",
    )


def format_chainage(metres) -> str:
    """Render metres back as ``km+mmm`` -- 1250 -> ``"1+250"``."""
    if metres is None:
        return ""
    value = Decimal(str(metres)).quantize(_QUANT)
    km, remainder = divmod(value, _METRES_PER_KM)
    # Keep the fractional part only when it carries information.
    if remainder == remainder.to_integral_value():
        return f"{int(km)}+{int(remainder):03d}"
    whole, frac = divmod(remainder, 1)
    return f"{int(km)}+{int(whole):03d}{str(frac).lstrip('0')}"


def segment_code(from_m, to_m) -> str:
    """The canonical code for a chainage segment, e.g. ``"0+000 - 1+250"``."""
    return f"{format_chainage(from_m)} - {format_chainage(to_m)}"


def validate_range(from_m, to_m) -> None:
    """Reject a segment that does not move forward."""
    if from_m is None or to_m is None:
        return
    if Decimal(str(to_m)) <= Decimal(str(from_m)):
        raise HTTPException(
            status_code=400,
            detail="invalid_chainage_range: end chainage must be greater than start",
        )


def natural_code_key(code: str) -> tuple:
    """Sort key that orders P2 before P10.

    Only for an explicit "renumber" action -- normal listing always orders by
    ``sort_order``, never by code.
    """
    parts = re.split(r"(\d+)", code or "")
    return tuple(
        (1, int(part)) if part.isdigit() else (0, part.lower())
        for part in parts
        if part != ""
    )
