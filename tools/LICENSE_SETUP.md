# Como o serial funciona (guia prático)

Cada serial `EAC2-...` vale **uma vez**. Ele fica preso a **este computador** e a **esta instalação**.

| O que a pessoa fez | Precisa de serial novo? |
|---|---|
| Fechou e abriu o InDesign | Não |
| Atualizou o plugin pelo botão verde | Não |
| Colou o mesmo código em outro computador | Sim |
| Desinstalou ou reinstalou o plugin | Sim |

No seu dia a dia você **só gera o serial no Terminal**, como antes. Não liga servidor.

A pessoa, na primeira ativação, precisa de internet. O InDesign fala sozinho com o Vercel (um site que não “desliga”). Isso é configurado **uma vez**.

---

## 1. Ver a chave privada (o Finder esconde)

O arquivo existe: o nome começa com ponto (`.license-private.pem`), então o Finder não mostra.

No Terminal, na pasta do projeto:

```bash
npm run license:show-key
```

O Finder abre com o arquivo selecionado. Se a lista continuar vazia, pressione **Command + Shift + ponto (.)**.

Copie esse arquivo para um pendrive ou pasta com senha. **Não** mande no WhatsApp nem no GitHub.

---

## 2. Uma vez só: Vercel (não precisa do Render)

Pode ser Vercel. Não use o Render gratuito: ele dorme e a ativação falha.

1. Entre em [https://vercel.com](https://vercel.com) e faça login com o **GitHub**.
2. **Add New…** → **Project** → importe `Fechamento-Editorial`.
3. Framework Preset: **Other**. Clique em **Deploy**.
4. Quando terminar, abra o projeto → aba **Storage** → **Create** → **Upstash Redis** (ou Redis) → conecte **neste** projeto.
5. Em **Settings** → **Environment Variables**, crie `LICENSE_ADMIN_SECRET` com uma senha longa que só você saiba. Anote junto da chave privada.
6. Em **Deployments**, faça **Redeploy** do último deploy (para o Redis valer).
7. Copie a URL de produção (no seu projeto: `https://fechamento-editorial-dkhbcbi2v.vercel.app`).
8. Se a URL for **diferente** da que está em `src/licensing/license-config.ts`, cole a URL certa ali.
9. No GitHub Desktop: commit, push. O Vercel publica sozinho.
10. Abra no Safari: `SUA-URL/health` — tem que aparecer `"ok": true` e `"store": "kv"`.

Você **não** liga isso no dia a dia. Fica no ar sozinho, sem “acordar” site.

---

## 3. Recarregar o plugin uma vez

No **UDT**: **Unload** → **Load** em `dist/manifest.json`. Abra o InDesign.

---

## 4. Todo dia: gerar serial e enviar (igual ao HMAC)

```bash
npm run license:serial -- "Nome da pessoa"
```

Cole a linha `EAC2-...` inteira só para aquela pessoa. Pronto.

---

## 5. Distribuir o plugin (.ccx)

1. Em `src/update/update-config.ts`, `UPDATE_DEV_FORCE_BANNER = false`.
2. `npm run package:ccx`
3. Arquivo em `release/EditorialAutoClose.ccx`.

---

## 6. Desinstalou / “serial já foi usado”

Gere **outro** serial e envie. Não reaproveite o anterior.

---

## Problemas comuns

| O que aparece | O que fazer |
|---|---|
| Não vejo `.license-private.pem` | `npm run license:show-key` ou Command + Shift + ponto no Finder |
| Serial já foi usado | Código novo para essa pessoa |
| Não foi possível contactar o servidor | Internet da pessoa; conferir `/health` no Vercel |
| `"store": "file"` no /health | Falta conectar o Redis no Vercel e fazer Redeploy |
