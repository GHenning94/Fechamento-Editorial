/**
 * URL opcional do servidor de ativação (POST /activate).
 * Deixe vazio: o serial é validado no plugin, funciona offline e em qualquer máquina.
 *
 * Exemplo local: "http://127.0.0.1:3921"
 * Produção: "https://fechamento-editorial.onrender.com"
 */
export const LICENSE_ACTIVATION_URL: string = "";

/**
 * Exibe botão "Resetar licença" no painel (somente para testes).
 * Defina false antes de distribuir o plugin aos clientes.
 */
export const LICENSE_DEV_ALLOW_RESET = true;
