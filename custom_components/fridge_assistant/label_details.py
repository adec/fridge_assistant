"""Deliberate printable details, independent of private notes and AI text."""
from datetime import date, datetime
import unicodedata


def label_note(value):
    if value is None:
        return ''
    if not isinstance(value, str) or len(value) > 500:
        raise ValueError('Label note must be text of no more than 500 characters')
    return value.strip()


def _normal(value):
    return ' '.join(unicodedata.normalize('NFKC', str(value or '')).casefold().split())


def _date(value, lang):
    try:
        parsed = date.fromisoformat(str(value)[:10])
        months = ('jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec') if lang=='nl' else ('Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec')
        return f'{parsed.day} {months[parsed.month-1]} {parsed.year}'
    except ValueError:
        return str(value or '')


def _time(value, lang):
    parsed = datetime.fromisoformat(value.replace('Z','+00:00'))
    return _date(parsed.date().isoformat(),lang)+' '+parsed.strftime('%H:%M')


def label_sections(item, lang='en'):
    nl = lang=='nl'
    handling = []
    for key,en,dutch in [('opened_at','Opened','Geopend'),('defrost_started_at','Defrosting started','Ontdooien gestart'),('defrosted_at','Thawed','Volledig ontdooid')]:
        if item.get(key) and (key!='defrost_started_at' or not item.get('defrosted_at')):
            handling.append(f'{dutch if nl else en}: {_time(item[key],lang)}')
    if item.get('defrost_started_at') and not item.get('defrosted_at'):
        handling.append('Bevestig wanneer volledig ontdooid' if nl else 'Confirm when fully defrosted')
    if item.get('handling_due_at'):
        reason = item.get('handling_reason')
        handling.insert(0, ('Na openen' if reason=='opened' else 'Na ontdooien') if nl else ('After opening' if reason=='opened' else 'After defrosting'))
        original=item.get('original_expiry_date')
        if original:
            kind=('THT' if nl else 'Best before') if item.get('original_date_type')=='best_before' else ('Te gebruiken tot' if nl else 'Use by')
            original_text = _date(original, lang)
            if item.get('original_expiry_precision') == 'month':
                original_text = original_text.split(' ', 1)[1]
            handling.append(f'{kind}: {original_text}')
    result=[]
    if handling:
        result.append(('BEHANDELING' if nl else 'HANDLING DETAILS', '\n'.join(handling)))
    note=str(item.get('label_note') or '').strip()
    if note:
        result.append(('INSTRUCTIES' if nl else 'INSTRUCTIONS',note))
    contents=str(item.get('contents') or '').strip()
    if contents and _normal(contents)!=_normal(item.get('name')):
        result.append(('INHOUD' if nl else 'CONTENTS',contents))
    return result
