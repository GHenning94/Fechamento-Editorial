# EDITORIAL AUTOCLOSE

Plugin UXP profissional para **Adobe InDesign 2025+** que automatiza checklist
editorial e fechamento de material (package, PDFs, IDML e relatório).

| Campo | Valor |
|-------|-------|
| **Nome comercial** | EDITORIAL AUTOCLOSE |
| **ID UXP** | `com.editorial.autoclose` |
| **Versão** | 1.0.0 |
| **InDesign mínimo** | 20.0 (2025+) |
| **Titular** | Henning |
| **Ano** | 2026 |

---

## Proteção de direitos autorais

Este repositório/pacote inclui documentação legal obrigatória:

| Arquivo | Finalidade |
|---------|------------|
| `COPYRIGHT.txt` | Aviso formal de titularidade |
| `LICENSE.md` | Termos de uso proprietários |
| `ESPECIFICACAO_FUNCIONAL.pdf` | Especificação funcional oficial |
| `CHANGELOG.md` | Histórico de versões |

**Uso, cópia ou redistribuição sem autorização expressa são proibidos.**

---

## Estrutura do projeto

```
EditorialAutoClose/
├── README.md
├── LICENSE.md
├── ESPECIFICACAO_FUNCIONAL.pdf
├── CHANGELOG.md
├── COPYRIGHT.txt
└── ../src/              ← código-fonte TypeScript (pasta irmã)
    ├── core/
    ├── validators/
    ├── services/
    ├── models/
    ├── ui/
    └── utils/
```

Artefatos de instalação (build):

```
dist/                    ← carregar no UXP Developer Tool
├── index.html
├── index.js
├── styles.css
├── manifest.json
└── icons/
```

---

## Funcionalidades

### VALIDAR CHECKLIST

Executa 17 validações editoriais e exibe erros, alertas e aprovados no painel.
O resultado fica em cache para uso no fechamento.

### FECHAR MATERIAL

1. Identificação do usuário  
2. Seleção da pasta de destino  
3. Salvamento do documento (se necessário)  
4. Package InDesign nativo (INDD, IDML, fontes, links)  
5. PDF principal — preset **CTP_Arte**, páginas simples, sem MEMORIAL  
6. PDF **_ESTILOS** — spreads espelhados, com MEMORIAL  
7. Relatório HTML — **somente** se o checklist foi validado antes para o mesmo
   documento  

---

## Requisitos

- Adobe InDesign 2025 ou superior  
- UXP Developer Tool (desenvolvimento) ou distribuição corporativa autorizada  
- Preset PDF **CTP_Arte** (ou fallback **CTP Arte**) instalado no InDesign  
- Node.js 18+ (apenas para build)  

---

## Build e instalação (desenvolvimento)

```bash
npm install
npm run build
```

No UXP Developer Tool: apontar para a pasta `dist/` → **Load**.  
Após alterações no código: **Unload → Load**.

---

## Fluxo recomendado de produção

1. Abrir o documento InDesign  
2. **VALIDAR CHECKLIST** — corrigir erros críticos  
3. **FECHAR MATERIAL** — escolher pasta e confirmar  

---

## Suporte e licenciamento

Contato com o titular dos direitos autorais para licenças, customizações e
autorizações de uso.

© 2026 Henning. Todos os direitos reservados.
