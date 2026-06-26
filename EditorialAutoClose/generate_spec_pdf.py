#!/usr/bin/env python3
"""Gera ESPECIFICACAO_FUNCIONAL.pdf — EDITORIAL AUTOCLOSE v1.0.0"""

from __future__ import annotations

import textwrap
from pathlib import Path

OUTPUT = Path(__file__).resolve().parent / "ESPECIFICACAO_FUNCIONAL.pdf"

LINES = """
ESPECIFICACAO FUNCIONAL
EDITORIAL AUTOCLOSE
Versao 1.0.0 | Junho 2026

1. OBJETIVO
Automatizar checklist editorial e fechamento de materiais InDesign,
gerando package padronizado com PDFs, IDML e relatorio opcional.

2. PLATAFORMA
- Plugin UXP para Adobe InDesign 2025+ (host minVersion 20.0)
- Linguagem: TypeScript, HTML, CSS
- Painel lateral UXP: EDITORIAL AUTOCLOSE

3. MODULOS PRINCIPAIS
3.1 VALIDAR CHECKLIST
Executa validadores modulares e exibe resumo no painel.
Armazena resultado em cache vinculado ao documento (nome + caminho).

3.2 FECHAR MATERIAL
Fluxo de fechamento sem reexecutar checklist automaticamente.
Gera package nativo e exporta PDFs. Relatorio HTML somente se
houver checklist validado previamente para o mesmo arquivo.

4. FLUXO DE FECHAMENTO
Passo 1 - Dialogo nativo: nome do usuario
Passo 2 - Selecao da pasta de destino
Passo 3 - Salvamento do documento se necessario
Passo 4 - Package InDesign (packageForPrint)
Passo 5 - PDF principal: preset CTP_Arte, paginas simples, MEMORIAL oculto
Passo 6 - PDF _ESTILOS: spreads espelhados, MEMORIAL visivel
Passo 7 - Relatorio HTML (condicional ao cache de checklist)

5. ESTRUTURA DO PACKAGE
{nome}/
  Document fonts/
  Links/
  {nome}.indd
  {nome}.idml
  {nome}.pdf
  {nome}_ESTILOS.pdf
  Relatorio_Fechamento.html (opcional)

6. VALIDADORES (CHECKLIST)
V01 Layers obrigatorias (MEMORIAL, GUIAS_DELETAR)
V02 Nomenclatura de layers
V03 Memorial descritivo
V04 Nomenclatura de cores (COR_*)
V06 Cor CorProf
V07 Cor GUIAS_DELETAR
V08 Overprint
V09 Idioma dos estilos (Portugues BR)
V10 Hifenizacao
V12 Fontes instaladas/disponiveis
V13 Fontes duplicadas
V14 Links (status e atualizacao)
V15 Espaco de cor das imagens
V16 Resolucao minima 300 DPI
V17 Espessura minima de fios 0,3 pt
V18 Itens na mesa de trabalho (pasteboard)
V19 Layers bloqueadas
V21 Overset de texto

7. REGRAS DE PDF
- Preset: CTP_Arte (fallback CTP Arte)
- PDF arte: exportReaderSpreads = false
- PDF _ESTILOS: exportReaderSpreads = true (spreads espelhados)
- Layer MEMORIAL oculta no PDF arte; visivel no PDF _ESTILOS
- Preset ausente: nenhum PDF exportado; aviso no painel

8. REGRAS DE FECHAMENTO
- Checklist nao bloqueia fechamento
- Checklist nao e executado automaticamente no fechamento
- Relatorio depende de VALIDAR CHECKLIST previo no mesmo documento
- Cache invalido se nome ou caminho do arquivo mudar

9. REQUISITOS NAO FUNCIONAIS
- Operacoes pesadas (PDF, package) fora de doScript quando possivel
- Pausas entre etapas para estabilidade do InDesign
- UI responsiva com barra de progresso por etapa

10. PERMISSOES UXP
- localFileSystem: fullAccess
- clipboard: readAndWrite

11. DOCUMENTACAO LEGAL
README.md, LICENSE.md, COPYRIGHT.txt, CHANGELOG.md
e este ESPECIFICACAO_FUNCIONAL.pdf compoem o pacote oficial.

Titular: Henning | (c) 2026 Todos os direitos reservados.
Documento gerado automaticamente para registro de especificacao funcional.
""".strip().splitlines()


def pdf_escape(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
        .encode("latin-1", errors="replace")
        .decode("latin-1")
    )


def wrap_lines(raw_lines: list[str], width: int = 92) -> list[str]:
    wrapped: list[str] = []
    for line in raw_lines:
        line = line.rstrip()
        if not line:
            wrapped.append("")
            continue
        wrapped.extend(textwrap.wrap(line, width=width) or [""])
    return wrapped


def build_pages(lines: list[str], lines_per_page: int = 52) -> list[list[str]]:
    pages: list[list[str]] = []
    for i in range(0, len(lines), lines_per_page):
        pages.append(lines[i : i + lines_per_page])
    return pages or [[""]]


def make_pdf(pages: list[list[str]], path: Path) -> None:
    objects: list[str] = []

    def add_obj(content: str) -> int:
        objects.append(content)
        return len(objects)

    font_obj = add_obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    page_obj_ids: list[int] = []
    content_obj_ids: list[int] = []

    for page_lines in pages:
        ops = ["BT", "/F1 10 Tf", "50 800 Td"]
        for idx, line in enumerate(page_lines):
            if idx > 0:
                ops.append("0 -14 Td")
            ops.append(f"({pdf_escape(line)}) Tj")
        ops.append("ET")
        stream = "\n".join(ops)
        stream_bytes = stream.encode("latin-1", errors="replace")
        content_id = add_obj(
            f"<< /Length {len(stream_bytes)} >>\nstream\n{stream}\nendstream"
        )
        content_obj_ids.append(content_id)
        page_id = add_obj(
            f"<< /Type /Page /Parent 0 0 R /MediaBox [0 0 612 842] "
            f"/Contents {content_id} 0 R "
            f"/Resources << /Font << /F1 {font_obj} 0 R >> >> >>"
        )
        page_obj_ids.append(page_id)

    kids = " ".join(f"{pid} 0 R" for pid in page_obj_ids)
    pages_id = add_obj(f"<< /Type /Pages /Kids [{kids}] /Count {len(page_obj_ids)} >>")

    for i, page_id in enumerate(page_obj_ids):
        page_content = objects[page_id - 1]
        objects[page_id - 1] = page_content.replace("/Parent 0 0 R", f"/Parent {pages_id} 0 R")

    catalog_id = add_obj(f"<< /Type /Catalog /Pages {pages_id} 0 R >>")

    body = ["%PDF-1.4\n"]
    offsets = [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(sum(len(part.encode("latin-1", errors="replace")) for part in body))
        body.append(f"{i} 0 obj\n{obj}\nendobj\n")

    xref_pos = sum(len(part.encode("latin-1", errors="replace")) for part in body)
    body.append(f"xref\n0 {len(objects) + 1}\n")
    body.append("0000000000 65535 f \n")
    for off in offsets[1:]:
        body.append(f"{off:010d} 00000 n \n")
    body.append(
        f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\n"
        f"startxref\n{xref_pos}\n%%EOF\n"
    )

    path.write_bytes("".join(body).encode("latin-1", errors="replace"))


def main() -> None:
    pages = build_pages(wrap_lines(LINES))
    make_pdf(pages, OUTPUT)
    print(f"Gerado: {OUTPUT} ({len(pages)} pagina(s))")


if __name__ == "__main__":
    main()
