# Licenciamento por serial — EDITORIAL AUTOCLOSE

O serial é validado pelo próprio plugin. Depois de ativar uma vez, fica salvo
neste computador e **não é pedido de novo** — só em caso de reinstalação.

O mesmo código funciona em outras máquinas e após reinstalar.

---

## Configuração inicial (uma vez)

```bash
npm run license:secret
npm run build
```

No UDT: **Unload → Load** (ou Instalar) a pasta `dist/`.

Não rode `license:secret` de novo depois de distribuir o plugin: serials
anteriores deixam de funcionar.

---

## Gerar e ativar

```bash
npm run license:serial -- "Nome do usuário"
```

Copie a linha `EAC1-XXXX-XXXX-XXXX-XXXX`. No InDesign, abra o painel, cole o
serial (botão **Colar** ou Cmd+V) e clique em **Ativar**.

| Situação | O que acontece |
|----------|----------------|
| Primeira ativação nesta máquina | Pede o serial |
| Unload/Load, reabrir o InDesign | Já fica ativo |
| Reinstalação do plugin | Pede o mesmo serial de novo |
| Outra pessoa / outro computador | Ativa com um serial gerado por você |

---

## Servidor (opcional)

Por padrão `LICENSE_ACTIVATION_URL` está vazio: funciona **offline**.

Se quiser só registrar ativações (sem bloquear reuso), aponte a URL, suba
`npm run license:server` e faça `npm run build`.

---

## Scripts

```bash
npm run license:secret   # gera o segredo (uma vez)
npm run license:serial   # gera um serial
npm run license:server   # servidor opcional
npm run build            # compila o plugin
```

## Atualizações

Altere só o arquivo `VERSION` (ex.: `1.0.1`) e faça commit/push pela app do
GitHub. O GitHub Actions gera a build e publica na branch `plugin-dist`.

Quem já tem o plugin vê um aviso verde e clica em **Atualizar**. Os arquivos
são trocados na pasta do plugin e a **licença permanece**.

O repositório precisa estar **público** (ou a branch `plugin-dist` acessível)
para o aviso e o download funcionarem. Ative Actions no GitHub.

Não rode `license:secret` de novo.

---

## Problemas

| Problema | O que fazer |
|----------|-------------|
| Serial não reconhecido | `npm run license:secret && npm run build`, gere um serial **novo**, Unload → Load |
| Pedindo serial de novo sem reinstalar | Ative de novo uma vez (a licença agora é salva de forma persistente) |
| Testar a tela de ativação de novo | Botão **Resetar licença** (só aparece com `LICENSE_DEV_ALLOW_RESET = true`) |
