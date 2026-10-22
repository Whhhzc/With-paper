from pathlib import Path
import json
import zipfile
import io
import pypdfium2 as pdfium
from PIL import Image, ImageChops, ImageStat

folder = Path(__file__).parent
results = folder / 'phase-one-results'
source = folder / 'phase-one-fixtures/source.pdf'
checks = []
with pdfium.PdfDocument(source) as original:
    for name, order in [('split.pdf', [1, 3]), ('delete.pdf', [0, 3]), ('sort.pdf', [3, 0, 1, 2]), ('cleaned.pdf', [0, 1, 2, 3])]:
        with pdfium.PdfDocument(results / name) as output:
            assert len(output) == len(order)
            for index, number in enumerate(order):
                a = original[number].render(scale=1).to_pil().convert('RGB')
                b = output[index].render(scale=1).to_pil().convert('RGB')
                assert a.size == b.size
                assert ImageChops.difference(a, b).getbbox() is None, (name, index)
                assert f'PAGE {number + 1}' in output[index].get_textpage().get_text_range()
        checks.append(f'{name}: page text, order and pixel-identical source rendering')
    with pdfium.PdfDocument(results / 'rotate.pdf') as output:
        for index in range(4):
            a = original[index].render(scale=1).to_pil().convert('RGB')
            if index in [1, 3]:
                a = a.transpose(Image.Transpose.ROTATE_270)
            b = output[index].render(scale=1).to_pil().convert('RGB')
            assert a.size == b.size
            # PDFium rasterizes rotated font outlines slightly differently from rotating a bitmap.
            assert max(ImageStat.Stat(ImageChops.difference(a, b)).mean) < .5
        checks.append('rotate.pdf: selected page orientation and content match (font rasterization tolerance)')
    with pdfium.PdfDocument(results / 'watermarked.pdf') as marked:
        for index in range(4):
            a = original[index].render(scale=1).to_pil().convert('RGB')
            b = marked[index].render(scale=1).to_pil().convert('RGB')
            assert ImageChops.difference(a, b).getbbox() is not None
            assert f'PAGE {index + 1}' in marked[index].get_textpage().get_text_range()
        checks.append('Chinese watermark visibly changes all pages; original body text remains')

with zipfile.ZipFile(results / 'split.zip') as archive:
    assert len(archive.namelist()) == 4
    for index, name in enumerate(archive.namelist()):
        with pdfium.PdfDocument(archive.read(name)) as document:
            assert len(document) == 1
            assert f'PAGE {index + 1}' in document[0].get_textpage().get_text_range()
    checks.append('split ZIP: four real single-page PDFs in correct order')
with zipfile.ZipFile(results / 'renamed.zip') as archive:
    assert archive.read('合同附件_008.pdf') == source.read_bytes()
    assert archive.read('合同附件_009.png') == (results / 'ocr-source.png').read_bytes()
    checks.append('rename ZIP: correct Unicode names and byte-identical original contents')
with zipfile.ZipFile(results / 'batch-watermark.zip') as archive:
    assert len(archive.namelist()) == 2
    assert sorted(len(pdfium.PdfDocument(archive.read(name))) for name in archive.namelist()) == [2, 4]
    checks.append('batch watermark ZIP: both inputs exported with preserved page counts')
with pdfium.PdfDocument(results / 'image.pdf') as document:
    assert len(document) == 1
    assert document[0].get_size() == (842.0, 595.0)
    checks.append('image PDF: actual image content on an A4 landscape page')
png = Image.open(results / 'rendered.png').convert('RGB')
jpg = Image.open(results / 'rendered.jpg').convert('RGB')
assert png.size == jpg.size == (1684, 1190)
assert max(ImageStat.Stat(png).stddev) > 15
assert max(ImageStat.Stat(ImageChops.difference(png, jpg)).mean) < 5
checks.append('PDF image export: non-empty 144 DPI PNG/JPEG with matching content')
for name in ['ocr-image.txt', 'ocr-pdf.txt']:
    text = (results / name).read_text(encoding='utf-8')
    assert '办公会议记录' in ''.join(text.split())
    assert 'office meeting' in text.lower()
    checks.append(f'{name}: actual Chinese and English recognized')
with zipfile.ZipFile(results / 'ocr-batch.zip') as archive:
    assert len(archive.namelist()) == 2
    assert all('office' in archive.read(name).decode('utf-8').lower() for name in archive.namelist())
    checks.append('batch OCR ZIP: actual text from both images')
downloaded = list(results.glob('识别结果*.txt'))
assert downloaded and all('人工核对后的文字' in file.read_text(encoding='utf-8') for file in downloaded)
checks.append('browser TXT downloads contain user-edited text')
(results / 'independent-checks.json').write_text(json.dumps({'status':'passed','checks':checks},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'PASS: {len(checks)} independent PDFium/Pillow/ZIP/text output checks.')
