from pathlib import Path
import json
import pypdfium2 as pdfium
from PIL import ImageChops

folder = Path(__file__).parent / 'content-editor-results'
checks = []
def text(document, index):
    return document[index].get_textpage().get_text_range()

with pdfium.PdfDocument(folder / 'original.pdf') as original:
    for name in ['edited-latin.pdf', 'edited-chinese.pdf', 'browser-downloaded.pdf']:
        with pdfium.PdfDocument(folder / name) as edited:
            assert len(edited) == len(original) == 2
            assert 'ORIGINAL TEXT' not in text(edited, 0)
            assert 'UNTOUCHED BODY' in text(edited, 0)
            a = original[1].render(scale=1).to_pil().convert('RGB')
            b = edited[1].render(scale=1).to_pil().convert('RGB')
            assert a.size == b.size and ImageChops.difference(a, b).getbbox() is None
            a = original[0].render(scale=1).to_pil().convert('RGB')
            b = edited[0].render(scale=1).to_pil().convert('RGB')
            assert ImageChops.difference(a.crop((0, 145, 595, 842)), b.crop((0, 145, 595, 842))).getbbox() is None
            checks.append(f'{name}: old text absent, unedited body and rotated/cropped second page preserved')
    with pdfium.PdfDocument(folder / 'browser-downloaded.pdf') as edited:
        assert '修改后的合同金额 12345' in text(edited, 0)
        edited[0].render(scale=1).to_pil().save(folder / 'downloaded-render.png')
        checks.append('Chinese replacement remains searchable native Unicode text')
    with pdfium.PdfDocument(folder / 'rapid-latest.pdf') as edited:
        assert '最终快速修改版本' in text(edited, 0) and '版本一' not in text(edited, 0)
        checks.append('Rapid typing exports the latest requested content')
    with pdfium.PdfDocument(folder / 'browser-multiple-pages.pdf') as edited:
        assert '最终快速修改版本' in text(edited, 0)
        assert 'ROTATED PAGE EDITED' in text(edited, 1) and 'SECOND PAGE KEEP' not in text(edited, 1)
        assert edited[1].get_size() == original[1].get_size()
        checks.append('Edits across pages survive while page geometry is unchanged')
    with pdfium.PdfDocument(folder / 'edited-objects.pdf') as edited:
        image = edited[0].render(scale=1).to_pil().convert('RGB')
        assert image.getpixel((300, 392)) == (0, 70, 220)
        assert image.getpixel((100, 312)) == (20, 180, 70)
        assert 'ORIGINAL TEXT' not in text(edited, 0)
        checks.append('Existing image and graphic were replaced/recolored, original text deleted')
    with pdfium.PdfDocument(folder / 'browser-replaced-image.pdf') as edited, pdfium.PdfDocument(folder / 'browser-multiple-pages.pdf') as before:
        a = before[0].render(scale=1).to_pil().convert('RGB')
        b = edited[0].render(scale=1).to_pil().convert('RGB')
        box = ImageChops.difference(a, b).getbbox()
        assert box is not None and box[0] >= 249 and box[1] >= 341 and box[2] <= 351 and box[3] <= 443, box
        checks.append('Browser image replacement affects only the original image frame')
    with pdfium.PdfDocument(folder / 'browser-deleted-text.pdf') as edited:
        assert '最终快速修改版本' not in text(edited, 0) and 'UNTOUCHED BODY' in text(edited, 0)
        checks.append('Deleting edited original text leaves the adjacent body intact')

assert (folder / 'browser-preview.pdf').read_bytes() == (folder / 'browser-downloaded.pdf').read_bytes()
checks.append('Downloaded bytes exactly equal the file used for right-hand preview')
(folder / 'independent-checks.json').write_text(json.dumps({'status':'passed','checks':checks},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'PASS: {len(checks)} independent native-content and preview/download checks.')
