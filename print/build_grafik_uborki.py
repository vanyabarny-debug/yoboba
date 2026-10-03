#!/usr/bin/env python3
"""Сборка HTML графика уборки санузла: A4 альбом, 2 вертикальных A5."""

from pathlib import Path

OUT = Path(__file__).with_name("grafik-uborki-sanuzla.html")

DAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]


def cell_pair() -> str:
    return """
            <td>
              <div class="slot"><span>исп</span><i></i></div>
              <div class="slot"><span>пров</span><i></i></div>
            </td>"""


def cell_extra() -> str:
    return """
            <td class="extra">
              <div class="slot"><span>время</span><i></i></div>
              <div class="slot two">
                <span>исп</span><i></i>
                <span>пров</span><i></i>
              </div>
            </td>"""


def sheet() -> str:
    rows = []
    for day in DAYS:
        rows.append(
            f"""
          <tr>
            <th class="day"><b>{day}</b><em>__.__</em></th>
            {cell_pair()}
            {cell_pair()}
            {cell_extra()}
          </tr>"""
        )
    return f"""
        <header class="head">
          <h1>График уборки санузла</h1>
          <p>yomoyo · Кимры, ул. Урицкого, 12</p>
        </header>

        <table class="meta">
          <tr>
            <td><label>ЮЛ / ИП</label></td>
            <td><label>период</label></td>
            <td><label>дезсредство</label></td>
          </tr>
        </table>

        <table class="g">
          <colgroup>
            <col class="c-day">
            <col>
            <col>
            <col>
          </colgroup>
          <thead>
            <tr>
              <th>день</th>
              <th>12:00<br>открытие</th>
              <th>20:00<br>закрытие</th>
              <th>внеплановая</th>
            </tr>
          </thead>
          <tbody>
            {"".join(rows)}
          </tbody>
        </table>

        <footer class="foot">
          <div><label>ответственный</label></div>
          <div><label>подпись</label></div>
          <div class="short"><label>дата</label></div>
        </footer>
    """


HTML = f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>График уборки санузла — A4 альбом, 2 вертикальных листа</title>
  <style>
    @page {{ size: 297mm 210mm; margin: 0; }}
    * {{ box-sizing: border-box; }}
    html, body {{
      margin: 0; padding: 0;
      width: 297mm; height: 210mm;
      background: #fff; color: #111;
      font-family: Arial, "Arial Unicode MS", Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }}
    .page {{
      width: 297mm; height: 210mm;
      display: flex; position: relative; overflow: hidden;
    }}
    .sheet {{
      width: 148.5mm; height: 210mm;
      padding: 8mm 6.5mm 7mm;
      display: flex; flex-direction: column; gap: 3.6mm;
    }}
    .cut {{
      position: absolute; left: 148.5mm; top: 12mm; bottom: 12mm;
      border-left: 0.3pt dashed #ccc;
    }}
    .head {{ text-align: center; }}
    h1 {{
      margin: 0; font-size: 12.5pt; letter-spacing: 0.07em;
      text-transform: uppercase; line-height: 1.05;
    }}
    .head p {{ margin: 1.5mm 0 0; font-size: 7.2pt; color: #555; }}
    label {{
      display: block; font-size: 5.5pt; color: #777;
      text-transform: uppercase; letter-spacing: 0.07em;
    }}
    .meta {{
      width: 100%; border-collapse: collapse; table-layout: fixed;
    }}
    .meta td {{
      border: 0.5pt solid #111; height: 10.5mm;
      padding: 1.1mm 2mm 0; vertical-align: top;
    }}
    table.g {{
      width: 100%; border-collapse: collapse; table-layout: fixed; flex: 1;
    }}
    .c-day {{ width: 17mm; }}
    .g th, .g td {{ border: 0.5pt solid #111; }}
    .g thead th {{
      font-size: 7.2pt; font-weight: 700; text-align: center;
      padding: 2mm 1mm 2.2mm; background: #f2f2f2; line-height: 1.25;
      vertical-align: middle;
    }}
    .g thead th:first-child {{
      font-size: 5.8pt; font-weight: 400; color: #777;
      text-transform: uppercase; letter-spacing: 0.06em;
    }}
    .g tbody tr {{ height: 14.28%; }}
    .g tbody th.day {{
      background: #fafafa; text-align: center; vertical-align: middle;
      font-weight: 400; padding: 0;
    }}
    .g tbody th.day b {{
      display: block; font-size: 9.5pt; letter-spacing: 0.06em;
      text-transform: uppercase; line-height: 1;
    }}
    .g tbody th.day em {{
      display: block; margin-top: 1.6mm; font-style: normal;
      font-size: 6.4pt; color: #aaa; letter-spacing: 0.1em;
    }}
    .g tbody td {{
      padding: 2.2mm 2.2mm 2mm; vertical-align: middle;
    }}
    .slot {{
      display: flex; align-items: flex-end; gap: 1.2mm;
      margin-bottom: 2.8mm;
    }}
    .slot:last-child {{ margin-bottom: 0; }}
    .slot span {{
      font-size: 5.4pt; color: #888; text-transform: uppercase;
      letter-spacing: 0.04em; width: 9.5mm; padding-bottom: 0.5mm;
      flex: none;
    }}
    .slot i {{
      flex: 1; height: 6.2mm; border-bottom: 0.5pt solid #222;
      font-style: normal;
    }}
    .slot.two span {{ width: 7.5mm; }}
    .slot.two i {{ margin-right: 1.5mm; }}
    .slot.two i:last-child {{ margin-right: 0; }}
    .foot {{ display: flex; gap: 2.5mm; }}
    .foot > div {{
      flex: 1; border: 0.5pt solid #111; height: 10.5mm;
      padding: 1.1mm 2mm 0;
    }}
    .foot .short {{ flex: 0.5; }}
  </style>
</head>
<body>
  <div class="page">
    <div class="cut"></div>
    <section class="sheet">{sheet()}</section>
    <section class="sheet">{sheet()}</section>
  </div>
</body>
</html>
"""

OUT.write_text(HTML, encoding="utf-8")
print(f"wrote {OUT}")
