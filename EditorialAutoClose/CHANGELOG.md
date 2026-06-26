# Changelog — EDITORIAL AUTOCLOSE

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).  
Versionamento conforme [Semantic Versioning](https://semver.org/lang/pt-BR/).

---

## [1.0.0] — 2026-06-25

### Adicionado

- Plugin UXP para Adobe InDesign 2025+ (ID 20.0+).
- Painel **VALIDAR CHECKLIST** com 17 validadores editoriais modulares.
- Fluxo **FECHAR MATERIAL** com package nativo InDesign, exportação de PDFs e
  IDML.
- Exportação de PDF principal (`{nome}.pdf`) — preset CTP_Arte, páginas simples,
  layer MEMORIAL oculta.
- Exportação de PDF _ESTILOS (`{nome}_ESTILOS.pdf`) — spreads espelhados, layer
  MEMORIAL visível.
- Cache de checklist: relatório HTML gerado somente se o usuário validou o
  documento previamente.
- Relatório HTML `Relatorio_Fechamento.html` incluído no package quando há
  checklist em cache.
- Modal nativo de identificação do usuário (`<dialog>`).
- Seletor de pasta de destino antes do processamento pesado.
- Arquitetura modular: `core/`, `validators/`, `services/`, `models/`, `ui/`,
  `utils/`.
- Documentação legal: README, LICENSE, COPYRIGHT e especificação funcional.

### Validadores do checklist (v1.0.0)

| ID | Área |
|----|------|
| V01 | Layers obrigatórias (MEMORIAL, GUIAS_DELETAR) |
| V02 | Nomenclatura de layers |
| V03 | Memorial descritivo |
| V04 | Nomenclatura de cores (COR_*) |
| V06 | Cor Profissional (CorProf) |
| V07 | Cor GUIAS_DELETAR |
| V08 | Overprint |
| V09 | Idioma dos estilos |
| V10 | Hifenização |
| V12 | Fontes |
| V13 | Fontes duplicadas |
| V14 | Links |
| V15 | Espaço de cor das imagens |
| V16 | Resolução de imagens (≥ 300 DPI) |
| V17 | Espessura de fios (≥ 0,3 pt) |
| V18 | Itens na mesa de trabalho |
| V19 | Layers bloqueadas |
| V21 | Overset de texto |

### Estrutura do package gerado

```
{nome_documento}/
├── Document fonts/
├── Links/
├── {nome}.indd
├── {nome}.idml
├── {nome}.pdf
├── {nome}_ESTILOS.pdf
└── Relatorio_Fechamento.html   (se checklist validado antes)
```

### Observações técnicas

- Build: `npm run build` → pasta `dist/`.
- Carregamento via UXP Developer Tool (Unload → Load após alterações).
- Operações pesadas (PDF, package) executadas fora de `doScript` quando possível
  para estabilidade do InDesign.

---

## [Unreleased]

### Planejado

- Ajustes conforme novas regras editoriais da casa.
- Melhorias de desempenho em documentos de grande porte.
