"""Independent output validation using installed PDFium and pdfminer engines."""
from pathlib import Path
import json
import sys
import pypdfium2 as pdfium
from pdfminer.high_level import extract_text
from PIL import ImageChops

folder = Path(__file__).parent / 'merge-fixtures'
output = folder / (sys.argv[1] if len(sys.argv) > 1 else 'merged-B-A.pdf')
sources = [(folder / 'B.pdf', 0), (folder / 'B.pdf', 1), (folder / 'A.pdf', 0), (folder / 'A.pdf', 1)]
expected = ['B FIRST', 'B SECOND', 'A FIRST', 'A SECOND']
checks = []
with pdfium.PdfDocument(output) as merged:
    assert len(merged) == 4
    for index, ((source_path, source_index), label) in enumerate(zip(sources, expected)):
        with pdfium.PdfDocument(source_path) as source:
            source_page = source[source_index]
            output_page = merged[index]
            a = source_page.render(scale=1).to_pil().convert('RGB')
            b = output_page.render(scale=1).to_pil().convert('RGB')
            assert a.size == b.size, (index, a.size, b.size)
            assert ImageChops.difference(a, b).getbbox() is None, f'Page {index + 1} rendered differently'
            text = output_page.get_textpage().get_text_range()
            assert label in text
            checks.append({'page': index + 1, 'text': label, 'render_size': a.size, 'pixel_match': True})
            if index == 0:
                b.save(folder / 'merged-first-page.png')
            source_page.close()
            output_page.close()
all_text = extract_text(str(output)).replace('\n', '').replace(' ', '')
positions = [all_text.index(label.replace(' ', '')) for label in expected]
assert positions == sorted(positions)
(folder / f'{output.stem}-verification.json').write_text(json.dumps({'result': 'passed', 'pages': checks, 'pdfminer_text_order': expected}, indent=2), encoding='utf-8')
print('PASS: independent PDFium rendering pixel-matches all 4 source pages; PDFium/pdfminer confirm text and order.')
