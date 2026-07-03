# Licenciamento por serial — EDITORIAL AUTOCLOSE

Guia completo: do teste local à produção com servidor.

---

## Visão geral

| Etapa | O que faz |
|-------|-----------|
| **Segredo HMAC** | Gera e valida serials (`EAC1-XXXX-XXXX-XXXX-XXXX`) |
| **Modo local** | Ativação só na máquina (sem controle de reuso) |
| **Servidor** | Cada serial só pode ser ativado **uma vez** (produção) |

---

## Passo 1 — Configuração inicial (uma vez)

```bash
cd /Users/henning/Desktop/FECHAMENTO_EDITORIAL

# Gera tools/.license-secret e embute o segredo no plugin
npm run license:secret

# Build do plugin
npm run build
```

No UDT (UXP Developer Tools): **Unload → Load** do plugin.

> **Importante:** Se rodar `license:secret` de novo, todos os serials anteriores deixam de funcionar. Gere novos serials após trocar o segredo.

---

## Passo 2 — Teste local (sem servidor) ← você está aqui

> **Unload/Load não apaga a licença.** Após ativar uma vez, o serial fica salvo na
> pasta de dados do UXP (`license.json`). Para testar a tela de ativação de novo:
> - Clique em **"Resetar licença (testes)"** no rodapé do painel (modo dev), ou
> - Defina `LICENSE_DEV_ALLOW_RESET = true` em `license-config.ts` (já vem assim).

Em `src/licensing/license-config.ts`:

```typescript
export const LICENSE_ACTIVATION_URL: string = "";
```

```bash
npm run build
```

Gere um serial de teste:

```bash
npm run license:serial -- "Teste local"
```

Copie o código exibido (ex.: `EAC1-QZLW-XQBE-VT4R-98F5`), abra o painel no InDesign e cole no campo de ativação.

**Comportamento:** o serial é validado pelo HMAC embutido no plugin. Funciona offline. O mesmo serial pode ser reutilizado após reinstalar (sem controle de uso único).

---

## Passo 3 — Teste com servidor local

### 3.1 Subir o servidor

Em um terminal separado (deixe rodando):

```bash
npm run license:server
```

Servidor em: `http://127.0.0.1:3921`

Teste rápido:

```bash
curl http://127.0.0.1:3921/health
# → {"ok":true}
```

### 3.2 Configurar o plugin

Em `src/licensing/license-config.ts`:

```typescript
export const LICENSE_ACTIVATION_URL: string = "http://127.0.0.1:3921";
```

```bash
npm run build
```

Unload → Load no UDT.

### 3.3 Gerar serial e ativar

```bash
npm run license:serial -- "Teste com servidor"
```

1. Abra o painel → informe o serial → **Ativar**
2. Plugin contacta `POST /activate` → serial marcado como usado em `tools/activation-server/used-serials.json`
3. Tente o **mesmo serial** de novo (ou simule reinstalação apagando a licença local) → servidor recusa com *"Serial já utilizado"*
4. Gere um **novo serial** para continuar

---

## Passo 4 — Produção (distribuir a clientes)

### 4.1 Hospedar o servidor

Suba `tools/activation-server/server.js` em um VPS com Node.js e HTTPS.

Arquivos necessários no servidor:

- `tools/activation-server/server.js`
- `tools/.license-secret` (mesmo segredo usado no build do plugin)

Variáveis opcionais:

```bash
LICENSE_SERVER_PORT=3921
LICENSE_SERVER_HOST=0.0.0.0
```

### 4.2 Configurar URL pública no plugin

Em `src/licensing/license-config.ts`:

```typescript
export const LICENSE_ACTIVATION_URL: string = "https://fechamento-editorial.onrender.com";
```

Rebuild e distribua o plugin (`dist/`).

### 4.3 Fluxo com cliente

1. Cliente instala o plugin
2. Você gera serial: `npm run license:serial -- "Cliente XYZ"`
3. Envia o código por e-mail/chat
4. Cliente ativa no painel
5. Reinstalação ou novo computador → **novo serial**

Registros:

| Arquivo | Conteúdo |
|---------|----------|
| `tools/issued-serials.json` | Seriais que você emitiu |
| `tools/activation-server/used-serials.json` | Seriais já ativados |

---

## Passo 5 — Checklist antes de entregar

- [ ] `LICENSE_ACTIVATION_URL` aponta para servidor HTTPS em produção
- [ ] `tools/.license-secret` **não** está no git (`.gitignore` ok)
- [ ] Build final: `npm run build`
- [ ] Testou ativação, uso do painel e recusa de serial reutilizado
- [ ] Documentação legal em `EditorialAutoClose/` atualizada

---

## Scripts npm (referência)

```bash
npm run license:secret   # gera segredo (uma vez)
npm run license:serial   # gera um serial para o cliente
npm run license:server   # servidor de ativação local
npm run build            # compila o plugin
```

---

## Solução de problemas

| Problema | Causa | Solução |
|----------|-------|---------|
| Serial não reconhecido | Segredo diferente entre gerador e plugin | Rode `license:secret` + `build` + gere serial novo |
| Erro de servidor | URL configurada mas servidor parado | Suba `license:server` ou deixe URL vazia |
| Serial já utilizado | Servidor registrou uso único | Gere novo serial |
| Ativação ok mas painel não abre | Build antigo no UDT | Unload → Load após `npm run build` |
| Unload/Load não pede serial de novo | Licença já salva localmente | Use **Resetar licença (testes)** no rodapé |
