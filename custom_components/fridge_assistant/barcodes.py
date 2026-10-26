"""Permanent template barcode validation; leading zeroes are significant."""
import re


class BarcodeError(ValueError):
    pass


def barcode_list(values):
    if not isinstance(values, list) or len(values) > 200:
        raise BarcodeError('Use a list of up to 200 barcodes per template')
    result = []
    for value in values:
        if not isinstance(value, str) or not re.fullmatch(r'[0-9]{8,14}', value.strip()):
            raise BarcodeError('Barcodes must contain 8–14 digits, including any leading zeroes')
        value = value.strip()
        if value not in result:
            result.append(value)
    return result
