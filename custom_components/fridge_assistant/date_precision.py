"""Keep month precision while storing a sortable final calendar day."""
from calendar import monthrange
from datetime import date


def normalise_expiry(value, precision='day'):
    if precision not in ('day', 'month'):
        raise ValueError('Invalid expiry precision')
    if not value or precision == 'day':
        return value
    parsed = date.fromisoformat(value)
    return parsed.replace(day=monthrange(parsed.year, parsed.month)[1]).isoformat()
