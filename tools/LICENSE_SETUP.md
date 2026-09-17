# Como o serial funciona (guia prático)

Cada serial `EAC2-...` vale **uma vez**. Ele fica preso a **este computador** e a **esta instalação** do plugin.

| O que a pessoa fez | Precisa de serial novo? |
|---|---|
| Fechou e abriu o InDesign | Não |
| Atualizou o plugin pelo botão verde | Não |
| Colou o mesmo código em outro computador | Sim (o antigo é recusado) |
| Desinstalou o plugin | Sim |
| Reinstalou o plugin | Sim |

A primeira ativação precisa de internet. Depois, aquele InDesign funciona sem rede, até desinstalar.

---

## 1. Uma vez só: guardar a chave privada

No seu Mac, o arquivo secreto já foi criado:

`tools/.license-private.pem`

1. Copie esse arquivo para um lugar seguro (pendrive, iCloud com senha, cofre).
2. **Não** envie esse arquivo no WhatsApp, e-mail ou GitHub.
3. Sem ele, você não consegue gerar seriais novos.

Se o arquivo já existe, **não** rode de novo o comando de gerar chaves com `--force`.

---

## 2. Uma vez só: ligar o servidor no Render

O plugin pergunta a um servidor na internet se o serial ainda não foi usado. Sem isso, o uso único não funciona.

1. Entre em [https://dashboard.render.com](https://dashboard.render.com) e faça login (pode usar a conta do GitHub).
2. Abra o serviço **fechamento-editorial**. Se ainda não existir:
   - **New +** → **Blueprint** (ou Web Service)
   - Conecte o repositório `Fechamento-Editorial`
   - O arquivo `render.yaml` já descreve o serviço
3. Em **Environment**, crie:
   - `LICENSE_ADMIN_SECRET` = uma senha longa que só você sabe (anote no mesmo lugar da chave privada)
   - `LICENSE_PUBLIC_KEY_B64` = pode deixar em branco; o servidor lê a chave pública do repositório
4. Em **Disk**, confirme um disco montado em `/var/data` (senão a lista de seriais some quando o servidor reinicia).
5. Clique em **Manual Deploy** → **Deploy latest commit** (depois de enviar o código ao GitHub).
6. Espere ficar **Live**. Abra no navegador:  
   `https://fechamento-editorial.onrender.com/health`  
   Tem de aparecer `"ok": true`.

Se o serviço “dormir” no plano gratuito, a primeira ativação do dia pode demorar ou falhar. Nesse caso, abra o endereço acima uma vez e tente ativar de novo.

---

## 3. Enviar o código ao GitHub e recarregar o plugin

1. No **GitHub Desktop**, escreva um resumo (por exemplo: `Licença de uso único`) e faça **Commit** e **Push**.
2. Espere o Render terminar o deploy.
3. No computador de teste, no **UDT** (Adobe UXP Developer Tool):
   - **Unload** no plugin
   - **Load** na pasta `dist/manifest.json`
4. Abra o InDesign e o painel **EDITORIAL AUTOCLOSE**.

---

## 4. Gerar um serial (sempre que for dar o plugin a alguém)

1. Abra o **Terminal** na pasta do projeto.
2. Cole (troque o nome):

```bash
npm run license:serial -- "Nome da pessoa"
```

3. Aparece uma linha começando com `EAC2-`. Ela já vai para a área de transferência.
4. Envie **essa linha inteira** só para aquela pessoa (WhatsApp, e-mail interno).
5. Guarde na sua lista quem recebeu qual código (o computador também anota em `tools/issued-serials.json`, que não vai para o GitHub).

A pessoa cola o código no InDesign **com internet ligada**. Se colar em outro computador, ou desinstalar e tentar o mesmo código, o plugin recusa.

---

## 5. Distribuir o plugin (.ccx)

1. Abra `src/update/update-config.ts` e deixe `UPDATE_DEV_FORCE_BANNER = false`.
2. No Terminal:

```bash
npm run package:ccx
```

3. O arquivo sai em `release/EditorialAutoClose.ccx`.
4. A pessoa dá clique duplo no `.ccx` (Creative Cloud) ou instala pelo UDT.

Cada pessoa precisa do **próprio** serial. Não compartilhe um código no grupo.

---

## 6. Se a pessoa desinstalou, formatou o Mac ou o serial “já foi usado”

Gere **outro** serial (`npm run license:serial`) e envie para ela.

Só use a liberação do código antigo se você tiver certeza de que ninguém mais vai usar aquele serial:

```bash
LICENSE_ADMIN_SECRET=sua-senha npm run license:release -- "EAC2-cole-o-codigo-inteiro"
```

A senha é a mesma do Render. No dia a dia, é mais simples emitir um serial novo.

---

## 7. Problemas comuns

| O que aparece | O que fazer |
|---|---|
| Serial já foi usado | Essa pessoa precisa de um código **novo** |
| Não foi possível contactar o servidor | Internet ligada; abrir o endereço `/health` do Render |
| Serial não reconhecido | Colar o código **inteiro**, começando com `EAC2-` |
| Pediu serial depois de só fechar o InDesign | Recarregue o plugin (`Unload` → `Load`) uma vez nesta versão nova |

Não rode `npm run license:keys -- --force` depois que alguém já estiver usando o plugin: todos os seriais antigos deixam de valer.
