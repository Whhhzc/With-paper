from pathlib import Path
import json
import pypdfium2 as pdfium
from PIL import ImageChops

folder = Path(__file__).parent / 'content-editor-results'
checks = []
with pdfium.PdfDocument(folder / 'original.pdf') as original, pdfium.PdfDocument(folder / 'inline-added-download.pdf') as added:
    assert len(added) == len(original) == 2
    text = added[0].get_textpage().get_text_range()
    expected = ['INLINE REVISED', '新增合同说明', '付款期限为30天', 'UNTOUCHED BODY']
    positions = [text.index(value) for value in expected]
    assert positions == sorted(positions), text
    assert 'ORIGINAL TEXT' not in text
    checks.append('Original text replaced and new Chinese paragraph follows it in PDF reading order')
    a = original[0].render(scale=1).to_pil().convert('RGB')
    b = added[0].render(scale=1).to_pil().convert('RGB')
    assert ImageChops.difference(a.crop((0, 200, 595, 842)), b.crop((0, 200, 595, 842))).getbbox() is None
    checks.append('Unedited lower-page content remains pixel-identical')
    a = original[1].render(scale=1).to_pil().convert('RGB')
    b = added[1].render(scale=1).to_pil().convert('RGB')
    assert a.size == b.size and ImageChops.difference(a, b).getbbox() is None
    checks.append('Untouched rotated/cropped page is unchanged')
with pdfium.PdfDocument(folder / 'inline-added-deleted.pdf') as deleted:
    text = deleted[0].get_textpage().get_text_range()
    assert '新增合同说明' not in text and 'INLINE REVISED' in text and 'UNTOUCHED BODY' in text
    checks.append('Deleting the inserted paragraph removes only its native text')
with pdfium.PdfDocument(folder / 'inline-rotated.pdf') as rotated:
    assert 'ROTATED INLINE' in rotated[1].get_textpage().get_text_range()
    assert 'SECOND PAGE KEEP' not in rotated[1].get_textpage().get_text_range()
    checks.append('Inline editing also changes actual text on the rotated/cropped page')
assert (folder / 'inline-added-preview.pdf').read_bytes() == (folder / 'inline-added-download.pdf').read_bytes()
checks.append('Actual browser download exactly matches the preview PDF, with inserted text present')
(folder / 'inline-independent-checks.json').write_text(json.dumps({'status':'passed','checks':checks},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'PASS: {len(checks)} independent inline-edit and paragraph-output checks.')
