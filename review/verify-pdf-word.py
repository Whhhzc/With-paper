"""Independent OOXML/PNG checks using only Python's standard library."""
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import struct
import zlib
import json

folder = Path(__file__).parent / 'pdf-word-results'
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'}
checks = []

def png_pixels(data):
    offset, compressed = 8, bytearray()
    while offset < len(data):
        size = struct.unpack('>I', data[offset:offset+4])[0]
        kind, body = data[offset+4:offset+8], data[offset+8:offset+8+size]
        if kind == b'IHDR':
            width, height, depth, color, _, _, interlace = struct.unpack('>IIBBBBB', body)
        if kind == b'IDAT':
            compressed.extend(body)
        offset += size + 12
    assert depth == 8 and color in (2, 6) and interlace == 0
    channels = 4 if color == 6 else 3
    stride = width * channels
    raw, previous, rows = zlib.decompress(compressed), bytearray(stride), []
    for y in range(height):
        base = y * (stride+1)
        mode = raw[base]
        row = bytearray(raw[base+1:base+1+stride])
        for x in range(stride):
            left = row[x-channels] if x >= channels else 0
            up = previous[x]
            corner = previous[x-channels] if x >= channels else 0
            if mode == 1: predictor = left
            elif mode == 2: predictor = up
            elif mode == 3: predictor = (left+up)//2
            elif mode == 4:
                p = left+up-corner
                distances = [abs(p-left), abs(p-up), abs(p-corner)]
                predictor = [left, up, corner][distances.index(min(distances))]
            else:
                assert mode == 0
                predictor = 0
            row[x] = (row[x]+predictor) & 255
        rows.append(row)
        previous = row
    def pixel(x, y):
        x, y = max(0, min(width-1, round(x))), max(0, min(height-1, round(y)))
        return rows[y][x*channels:x*channels+3]
    return width, height, pixel

with ZipFile(folder / 'converted.docx') as archive:
    assert archive.testzip() is None
    for name in archive.namelist():
        if name.endswith(('.xml', '.rels')):
            ET.fromstring(archive.read(name))
    checks.append('All DOCX XML parts parse and ZIP CRC checks pass')
    root = ET.fromstring(archive.read('word/document.xml'))
    text = ''.join(node.text or '' for node in root.findall('.//w:t', ns))
    for expected in ['CONVERSION REPORT', '合同金额：12345.60 元', '准确提取中文与 English 2026', 'LEFT COLUMN', 'RIGHT COLUMN', '12345.60', 'ROTATED CROP PAGE', '办公会议记录', 'Please finish the report by Friday.']:
        assert expected in text, expected
    checks.append('Native Unicode, numbers, columns and scanned Chinese/English text are present')
    assert len(root.findall('.//w:pgSz', ns)) == 3
    assert len(root.findall('.//w:b', ns)) >= 7
    assert len(root.findall('.//w:txbxContent', ns)) > 20
    assert root.find('.//wp:anchor', ns) is not None
    checks.append('Three page sections, bold text and editable text boxes are retained')
    width, height, pixel = png_pixels(archive.read('word/media/page1.png'))
    sx, sy = width/595, height/842
    samples = [pixel(x*sx, y*sy) for y in range(40, 70, 2) for x in range(45, 330, 3)]
    assert sum(min(rgb) >= 245 for rgb in samples)/len(samples) > .98
    checks.append('Native title is removed from background artwork, so text is not a duplicate page screenshot')
    blue = pixel(50*sx, 510*sy)
    assert blue[2] > blue[0]+15 and blue[2] > 230, list(blue)
    assert any(max(pixel(45*sx+dx, 362*sy+dy)) < 200 for dx in range(-2, 3) for dy in range(-2, 3))
    checks.append('Colored artwork and table border pixels survive separately from editable text')

word_saved = folder / 'edited-in-word.docx'
if word_saved.exists():
    with ZipFile(word_saved) as saved:
        imported = ET.fromstring(saved.read('word/document.xml'))
    text = ''.join(node.text or '' for node in imported.findall('.//w:t', ns))
    assert '合同金额：12345.60 元' in text and 'EDITED IN WORD' in text and 'CONVERSION REPORT' not in text
    checks.append('Microsoft Word independently retains native Chinese and saves an edited title')

report = {'status': 'passed', 'checks': checks, 'word_rendered_pdf_available': (folder / 'converted-word.pdf').exists()}
(folder / 'independent-checks.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'PASS: {len(checks)} independent DOCX checks; Word PDF rendering available: {report["word_rendered_pdf_available"]}')
