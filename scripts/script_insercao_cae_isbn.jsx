#target "InDesign"

/*
============================================================
SEQUENCIAL AUTOMÁTICO - CAE / ISBN
Adobe InDesign - ExtendScript (.jsx)
============================================================
*/

(function () {

    // ============================================================
    // CONFIGURAÇÕES
    // ============================================================

    var CAE_W = 35;
    var CAE_H = 17;

    var ISBN_W = 37.5;
    var ISBN_H = 23.5;

    var TOLERANCIA_MM = 1.5;

    var FALLBACK_COLUNA_CAE = 7;
    var FALLBACK_COLUNA_ISBN = 1;

    // ============================================================
    // FUNÇÃO PRINCIPAL
    // ============================================================

    function main() {

        if (app.documents.length === 0) {
            alert("Por favor, abra o seu documento do InDesign antes de rodar o script.");
            return;
        }

        var doc = app.activeDocument;

        // ========================================================
        // 1. MENU DE OPÇÕES
        // ========================================================

        var janelaMenu = new Window("dialog", "Configuração do Script");
        janelaMenu.orientation = "column";
        janelaMenu.alignChildren = ["left", "top"];
        janelaMenu.spacing = 8;
        janelaMenu.margins = 15;

        janelaMenu.add("statictext", undefined, "Selecione o modo de aplicação desejado:");

        var optCae = janelaMenu.add("radiobutton", undefined, "1. Inserir somente CAE (caixas de 35 x 17 mm)");
        var optIsbn = janelaMenu.add("radiobutton", undefined, "2. Inserir somente ISBN (caixas de 37,5 x 23,5 mm)");
        var optAmbos = janelaMenu.add("radiobutton", undefined, "3. Inserir CAE e ISBN (automaticamente por tamanho)");

        optAmbos.value = true;

        var grupoBotoes = janelaMenu.add("group");
        grupoBotoes.alignment = "center";
        grupoBotoes.add("button", undefined, "Iniciar", { name: "ok" });
        grupoBotoes.add("button", undefined, "Cancelar", { name: "cancel" });

        if (janelaMenu.show() !== 1) {
            return;
        }

        var processarCae = optCae.value || optAmbos.value;
        var processarIsbn = optIsbn.value || optAmbos.value;

        // ========================================================
        // 2. SELECIONAR CSV
        // ========================================================

        var csvFile = File.openDialog("Selecione o arquivo CSV do seu Excel", function (f) {
            if (f instanceof Folder) return true;
            return /\.csv$/i.test(f.name);
        });

        if (!csvFile) return;

        var baseFolder = csvFile.parent;

        // ========================================================
        // 3. LER CSV
        // ========================================================

        if (!csvFile.open("r")) {
            alert("Não foi possível abrir o arquivo CSV.");
            return;
        }

        try {
            csvFile.encoding = "UTF-8";
        } catch (eEncoding) {}

        var csvContent = csvFile.read();
        csvFile.close();
        csvContent = csvContent.replace(/^\uFEFF/, "");

        // ========================================================
        // 4. SEPARAR LINHAS
        // ========================================================

        var linhas = csvContent.split(/\r\n|\n|\r/);
        var linhasValidas = [];

        for (var i = 0; i < linhas.length; i++) {
            if (linhas[i] !== null && linhas[i] !== undefined && linhas[i].replace(/\s/g, "") !== "") {
                linhasValidas.push(linhas[i]);
            }
        }

        if (linhasValidas.length < 2) {
            alert("Erro: o arquivo CSV precisa possuir uma linha de cabeçalho e pelo menos uma linha de dados.");
            return;
        }

        // ========================================================
        // 5. DETECTAR SEPARADOR
        // ========================================================

        var primeiraLinha = linhasValidas[0];
        var separador = detectarSeparadorCSV(primeiraLinha);
        var cabecalhos = parseCSVLine(primeiraLinha, separador);

        // ========================================================
        // 6. LOCALIZAR COLUNAS CAE / ISBN PELO CABEÇALHO
        // ========================================================

        var indexCae = encontrarColuna(cabecalhos, "CAE");
        var indexIsbn = encontrarColuna(cabecalhos, "ISBN");

        if (indexCae === -1) indexCae = FALLBACK_COLUNA_CAE;
        if (indexIsbn === -1) indexIsbn = FALLBACK_COLUNA_ISBN;

        // ========================================================
        // 7. GUARDAR UNIDADES ORIGINAIS
        // ========================================================

        var originalX = doc.viewPreferences.horizontalMeasurementUnits;
        var originalY = doc.viewPreferences.verticalMeasurementUnits;
        var originalScriptUnit = app.scriptPreferences.measurementUnit;

        // ========================================================
        // 8. CONTADORES / LOG
        // ========================================================

        var registroIndex = 1;
        var paginasModificadas = 0;
        var totalCaixasEncontradas = 0;
        var totalLinhasProcessadas = 0;
        var errosLog = []; 

        // ========================================================
        // 9. PROCESSAMENTO
        // ========================================================

        try {
            app.scriptPreferences.measurementUnit = MeasurementUnits.MILLIMETERS;
            doc.viewPreferences.horizontalMeasurementUnits = MeasurementUnits.MILLIMETERS;
            doc.viewPreferences.verticalMeasurementUnits = MeasurementUnits.MILLIMETERS;

            for (var p = 0; p < doc.pages.length; p++) {
                var paginaLayout = doc.pages[p];

                if (registroIndex >= linhasValidas.length) {
                    break;
                }

                var caixasEncontradas = [];

                // A1. PÁGINA-MESTRE
                try {
                    var itensMestreDaPagina = paginaLayout.masterPageItems;
                    for (var mi = 0; mi < itensMestreDaPagina.length; mi++) {
                        var itemMaster = itensMestreDaPagina[mi];
                        if (!itemMaster || !itemMaster.isValid) continue;

                        var tipoMaster = identificarTipoCaixa(itemMaster, processarCae, processarIsbn);
                        if (tipoMaster === null) continue;

                        var overrideMaster = obterOverrideSeguro(itemMaster, paginaLayout);
                        if (overrideMaster !== null && overrideMaster.isValid) {
                            adicionarCaixaSeNaoExistir(caixasEncontradas, overrideMaster, tipoMaster);
                        }
                    }
                } catch (eMasterPageItems) {}

                // A2. APPLIED MASTER (FALLBACK)
                try {
                    if (paginaLayout.appliedMaster !== null && paginaLayout.appliedMaster.isValid) {
                        var itensMaster = paginaLayout.appliedMaster.allPageItems;
                        for (var m = 0; m < itensMaster.length; m++) {
                            var itemMaster2 = itensMaster[m];
                            if (!itemMaster2 || !itemMaster2.isValid) continue;

                            var tipoMaster2 = identificarTipoCaixa(itemMaster2, processarCae, processarIsbn);
                            if (tipoMaster2 === null) continue;

                            var overrideMaster2 = obterOverrideSeguro(itemMaster2, paginaLayout);
                            if (overrideMaster2 !== null && overrideMaster2.isValid) {
                                adicionarCaixaSeNaoExistir(caixasEncontradas, overrideMaster2, tipoMaster2);
                            }
                        }
                    }
                } catch (eAppliedMaster) {}

                // A3. TODOS OS ITENS DIRETAMENTE NA PÁGINA
                try {
                    var todosOsItens = paginaLayout.allPageItems;
                    for (var ai = 0; ai < todosOsItens.length; ai++) {
                        var itemPagina = todosOsItens[ai];
                        if (!itemPagina || !itemPagina.isValid) continue;

                        var tipoItem = identificarTipoCaixa(itemPagina, processarCae, processarIsbn);
                        if (tipoItem !== null) {
                            adicionarCaixaSeNaoExistir(caixasEncontradas, itemPagina, tipoItem);
                        }
                    }
                } catch (eAllPageItems) {}

                // A4. GRUPOS / ITENS ANINHADOS
                try {
                    adicionarItensDeGrupos(paginaLayout.allPageItems, caixasEncontradas, processarCae, processarIsbn);
                } catch (eGroups) {}

                // A5. RETÂNGULOS DA PÁGINA
                try {
                    var todosOsRetangulos = paginaLayout.rectangles;
                    for (var r = 0; r < todosOsRetangulos.length; r++) {
                        var rectPagina = todosOsRetangulos[r];
                        if (!rectPagina || !rectPagina.isValid) continue;

                        var tipoPagina = identificarTipoCaixa(rectPagina, processarCae, processarIsbn);
                        if (tipoPagina !== null) {
                            adicionarCaixaSeNaoExistir(caixasEncontradas, rectPagina, tipoPagina);
                        }
                    }
                } catch (eRectangles) {}

                totalCaixasEncontradas += caixasEncontradas.length;

                if (caixasEncontradas.length === 0) {
                    continue; 
                }

                var colunas = parseCSVLine(linhasValidas[registroIndex], separador);
                var aplicouAlgumNaPagina = false;

                for (var iBox = 0; iBox < caixasEncontradas.length; iBox++) {
                    var caixaAtual = caixasEncontradas[iBox].objeto;
                    var tipoAtual = caixasEncontradas[iBox].tipo;

                    if (!caixaAtual || !caixaAtual.isValid) continue;

                    var indiceColunaAlvo = tipoAtual === "ISBN" ? indexIsbn : indexCae;
                    var identificador = "";

                    if (indiceColunaAlvo >= 0 && indiceColunaAlvo < colunas.length) {
                        identificador = limparValorCSV(colunas[indiceColunaAlvo]);
                    }

                    if (identificador === "" || identificador === "-") continue;

                    var resultadoEPS = localizarEPS(baseFolder, identificador);

                    if (resultadoEPS.file === null) {
                        errosLog.push(
                            "Pág. " + paginaLayout.name + " [" + tipoAtual + "] | Valor CSV: " + identificador + " | EPS NÃO ENCONTRADO: " + resultadoEPS.nomeProcurado
                        );
                        continue;
                    }

                    try {
                        // Zera qualquer opção de ajuste automático que possa distorcer o EPS
                        try {
                            caixaAtual.frameFittingOptions.autoFit = false;
                            caixaAtual.frameFittingOptions.fittingOnEmptyFrame = EmptyFrameFittingOptions.NONE;
                        } catch (eFitOpt) {}

                        if (caixaPossuiMesmoEPS(caixaAtual, resultadoEPS.file)) {
                            for (var g = 0; g < caixaAtual.allGraphics.length; g++) {
                                caixaAtual.allGraphics[g].horizontalScale = 100;
                                caixaAtual.allGraphics[g].verticalScale = 100;
                            }
                            centralizarGraficos(caixaAtual);
                            aplicouAlgumNaPagina = true;
                            continue;
                        }

                        // Insere o arquivo
                        caixaAtual.place(resultadoEPS.file);

                        // Garante escala exata de 100% no arquivo inserido
                        for (var g = 0; g < caixaAtual.allGraphics.length; g++) {
                            var grafico = caixaAtual.allGraphics[g];
                            try {
                                grafico.horizontalScale = 100;
                                grafico.verticalScale = 100;
                            } catch (eScale) {} 
                        }

                        // Centraliza estritamente no meio do quadro
                        centralizarGraficos(caixaAtual);
                        aplicouAlgumNaPagina = true;

                    } catch (ePlace) {
                        errosLog.push("Pág. " + paginaLayout.name + " [" + tipoAtual + "] | Erro ao inserir: " + ePlace);
                    }
                }

                if (aplicouAlgumNaPagina) {
                    paginasModificadas++;
                }

                registroIndex++;
                totalLinhasProcessadas++;
            }

        } catch (eProcessamento) {
            alert("O script encontrou um erro crítico:\n" + eProcessamento);
        } finally {
            try {
                doc.viewPreferences.horizontalMeasurementUnits = originalX;
                doc.viewPreferences.verticalMeasurementUnits = originalY;
                app.scriptPreferences.measurementUnit = originalScriptUnit;
            } catch (eRestore) {}
        }

        // ========================================================
        // 10. MENSAGEM FINAL
        // ========================================================

        var msgFinal = "";

        if (errosLog.length > 0) {
            var txtRelatorio = new File(baseFolder.fsName + "/relatorio_erros.txt");

            if (txtRelatorio.open("w")) {
                try { txtRelatorio.encoding = "UTF-8"; } catch (eReportEncoding) {}
                txtRelatorio.writeln("=== ERROS ENCONTRADOS ===");
                txtRelatorio.writeln("Data/Hora: " + new Date().toLocaleString());
                txtRelatorio.writeln("==========================\n");

                for (var e = 0; e < errosLog.length; e++) {
                    txtRelatorio.writeln(errosLog[e]);
                }
                txtRelatorio.close();
            }
            msgFinal = "Processo concluído com ressalvas.\n\nFaltaram " + errosLog.length + " arquivos EPS.\nConsulte o 'relatorio_erros.txt'.";

        } else if (paginasModificadas === 0) {
            msgFinal = "Alerta: Nenhuma caixa preenchida.\nVerifique se as medidas (CAE 35x17mm / ISBN 37,5x23,5mm) estão corretas.";
        } else {
            msgFinal = "Aplicação automatizada com sucesso!";
        }

        alert(msgFinal);
    }

    // ============================================================
    // DEMAIS FUNÇÕES 
    // ============================================================

    function detectarSeparadorCSV(linha) {
        var quantidadeVirgulas = contarSeparadoresForaDeAspas(linha, ",");
        var quantidadePontoVirgulas = contarSeparadoresForaDeAspas(linha, ";");
        return (quantidadePontoVirgulas > quantidadeVirgulas) ? ";" : ",";
    }

    function contarSeparadoresForaDeAspas(linha, separador) {
        var dentroAspas = false;
        var contador = 0;
        for (var i = 0; i < linha.length; i++) {
            var caractere = linha.charAt(i);
            if (caractere === '"') {
                if (dentroAspas && linha.charAt(i + 1) === '"') {
                    i++;
                } else {
                    dentroAspas = !dentroAspas;
                }
            } else if (caractere === separador && !dentroAspas) {
                contador++;
            }
        }
        return contador;
    }

    function parseCSVLine(linha, separador) {
        var resultado = [];
        var atual = "";
        var dentroAspas = false;

        for (var i = 0; i < linha.length; i++) {
            var caractere = linha.charAt(i);
            if (caractere === '"') {
                if (dentroAspas && linha.charAt(i + 1) === '"') {
                    atual += '"';
                    i++;
                } else {
                    dentroAspas = !dentroAspas;
                }
            } else if (caractere === separador && !dentroAspas) {
                resultado.push(atual);
                atual = "";
            } else {
                atual += caractere;
            }
        }
        resultado.push(atual);
        return resultado;
    }

    function normalizarTexto(valor) {
        if (valor === null || valor === undefined) return "";
        var texto = String(valor);
        texto = texto.replace(/^\uFEFF/, "");
        texto = texto.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
        texto = texto.replace(/\u00A0/g, " ");
        texto = texto.replace(/^\s+|\s+$/g, "");
        if (texto.length >= 2 && texto.charAt(0) === '"' && texto.charAt(texto.length - 1) === '"') {
            texto = texto.substring(1, texto.length - 1);
        }
        texto = texto.replace(/^\s+|\s+$/g, "");
        return texto;
    }

    function limparValorCSV(valor) {
        var texto = normalizarTexto(valor);
        texto = texto.replace(/^\s+|\s+$/g, "");
        return texto;
    }

    function encontrarColuna(cabecalhos, nomeProcurado) {
        var alvo = normalizarTexto(nomeProcurado).toUpperCase();
        for (var i = 0; i < cabecalhos.length; i++) {
            var nome = normalizarTexto(cabecalhos[i]).toUpperCase();
            if (nome === alvo) return i;
        }
        for (var j = 0; j < cabecalhos.length; j++) {
            var nomeParcial = normalizarTexto(cabecalhos[j]).toUpperCase();
            if (nomeParcial.indexOf(alvo) !== -1) return j;
        }
        return -1;
    }

    function identificarTipoCaixa(objeto, processarCae, processarIsbn) {
        try {
            if (!objeto || !objeto.isValid) return null;
            var gb = objeto.geometricBounds;
            if (!gb || gb.length < 4) return null;

            var top = Number(gb[0]);
            var left = Number(gb[1]);
            var bottom = Number(gb[2]);
            var right = Number(gb[3]);

            if (isNaN(top) || isNaN(left) || isNaN(bottom) || isNaN(right)) return null;

            var hRaw = Math.abs(bottom - top);
            var wRaw = Math.abs(right - left);

            var wMmA = wRaw;
            var hMmA = hRaw;
            var wMmB = wRaw * 25.4 / 72;
            var hMmB = hRaw * 25.4 / 72;

            var melhorW = wMmA;
            var melhorH = hMmA;

            var erroA = menorErroDimensao(wMmA, hMmA);
            var erroB = menorErroDimensao(wMmB, hMmB);

            if (erroB < erroA) {
                melhorW = wMmB;
                melhorH = hMmB;
            }

            if (processarCae) {
                var erroCae = Math.min(distanciaRetangulo(melhorW, melhorH, 35, 17), distanciaRetangulo(melhorW, melhorH, 17, 35));
                if (erroCae <= TOLERANCIA_MM) return "CAE";
            }

            if (processarIsbn) {
                var erroIsbn = Math.min(distanciaRetangulo(melhorW, melhorH, 37.5, 23.5), distanciaRetangulo(melhorW, melhorH, 23.5, 37.5));
                if (erroIsbn <= TOLERANCIA_MM) return "ISBN";
            }

            // CORREÇÃO: Lógica do campo branco (impede conflito caso apenas 1 checkbox esteja ativo)
            if (ehCampoBranco(objeto)) {
                var candidatoCae = Math.min(distanciaRetangulo(melhorW, melhorH, 35, 17), distanciaRetangulo(melhorW, melhorH, 17, 35));
                var candidatoIsbn = Math.min(distanciaRetangulo(melhorW, melhorH, 37.5, 23.5), distanciaRetangulo(melhorW, melhorH, 23.5, 37.5));

                var faixaLargura = (melhorW >= 28 && melhorW <= 42) || (melhorH >= 28 && melhorH <= 42);
                var faixaAltura = (melhorH >= 12 && melhorH <= 30) || (melhorW >= 12 && melhorW <= 30);

                if (faixaLargura && faixaAltura) {
                    if (candidatoCae <= candidatoIsbn) {
                        if (processarCae) return "CAE";
                    } else {
                        if (processarIsbn) return "ISBN";
                    }
                }
            }
        } catch (e) {}
        return null;
    }

    function menorErroDimensao(w, h) {
        var erros = [
            distanciaRetangulo(w, h, 35, 17),
            distanciaRetangulo(w, h, 17, 35),
            distanciaRetangulo(w, h, 37.5, 23.5),
            distanciaRetangulo(w, h, 23.5, 37.5)
        ];
        var menor = erros[0];
        for (var i = 1; i < erros.length; i++) {
            if (erros[i] < menor) menor = erros[i];
        }
        return menor;
    }

    function distanciaRetangulo(w, h, alvoW, alvoH) {
        return Math.abs(w - alvoW) + Math.abs(h - alvoH);
    }

    function ehCampoBranco(objeto) {
        try {
            if (!objeto.fillColor || !objeto.fillColor.isValid) return false;
            var nomeCor = "";
            try { nomeCor = String(objeto.fillColor.name).toLowerCase(); } catch (eColorName) {}

            if (nomeCor === "paper" || nomeCor === "[paper]" || nomeCor === "white" || nomeCor === "[white]" || nomeCor.indexOf("white") !== -1 || nomeCor.indexOf("branco") !== -1 || nomeCor.indexOf("papel") !== -1) {
                return true;
            }

            try {
                var valores = objeto.fillColor.colorValue;
                if (valores && valores.length >= 3) {
                    var r = Number(valores[0]);
                    var g = Number(valores[1]);
                    var b = Number(valores[2]);
                    if (r >= 95 && g >= 95 && b >= 95) return true;
                }
            } catch (eRGB) {}
        } catch (e) {}
        return false;
    }

    function obterOverrideSeguro(objetoMaster, pagina) {
        try {
            var idMaster = objetoMaster.id;
            var objetosPagina = pagina.allPageItems; 
            for (var i = 0; i < objetosPagina.length; i++) {
                try {
                    var item = objetosPagina[i];
                    var masterItem = item.overriddenMasterPageItem;
                    if (masterItem !== null && masterItem !== undefined && masterItem.isValid && masterItem.id === idMaster) {
                        return item;
                    }
                } catch (eOverridden) {}
            }
        } catch (eBusca) {}

        try {
            var resultado = objetoMaster.override(pagina);
            if (resultado && resultado.isValid) {
                return resultado;
            }
        } catch (eOverride) {}
        return null;
    }

    function adicionarCaixaSeNaoExistir(lista, objeto, tipo) {
        for (var i = 0; i < lista.length; i++) {
            try {
                if (lista[i].objeto === objeto) return;
                if (lista[i].objeto.isValid && objeto.isValid && lista[i].objeto.id === objeto.id) return;
            } catch (e) {}
        }
        lista.push({ objeto: objeto, tipo: tipo });
    }

    function adicionarItensDeGrupos(itens, lista, processarCae, processarIsbn) {
        if (!itens || itens.length === 0) return;
        for (var i = 0; i < itens.length; i++) {
            var item = itens[i];
            if (!item || !item.isValid) continue;

            var tipo = identificarTipoCaixa(item, processarCae, processarIsbn);
            if (tipo !== null) {
                adicionarCaixaSeNaoExistir(lista, item, tipo);
            }

            try {
                if (item.constructor.name === "Group" || (item.pageItems && item.pageItems.length > 0)) {
                    adicionarItensDeGrupos(item.pageItems, lista, processarCae, processarIsbn);
                }
            } catch (eGroup) {}
        }
    }

    function normalizarNomeArquivoParaBusca(nome) {
        var texto = normalizarTexto(nome);
        texto = texto.replace(/^.*[\\\/]/, "");
        texto = texto.replace(/\.eps$/i, "");
        texto = texto.replace(/^\s+|\s+$/g, "");
        texto = texto.toLowerCase();
        return texto;
    }

    function localizarEPS(pasta, identificador) {
        var valorOriginal = limparValorCSV(identificador);
        var nomeBase = valorOriginal.replace(/^.*[\\\/]/, "");
        nomeBase = nomeBase.replace(/\.eps$/i, "");
        nomeBase = nomeBase.replace(/^\s+|\s+$/g, "");
        var nomeProcurado = nomeBase + ".eps";

        var arquivoDireto = new File(pasta.fsName + "/" + nomeProcurado);
        if (arquivoDireto.exists && !arquivoDireto.hidden) {
            return { file: arquivoDireto, nomeProcurado: nomeProcurado };
        }

        var arquivos = pasta.getFiles(function (item) {
            if (!(item instanceof File)) return false;
            return /\.eps$/i.test(item.name);
        });

        var alvoNormalizado = normalizarNomeArquivoParaBusca(nomeBase);
        for (var i = 0; i < arquivos.length; i++) {
            var nomeArquivo = normalizarNomeArquivoParaBusca(arquivos[i].name);
            if (nomeArquivo === alvoNormalizado) {
                return { file: arquivos[i], nomeProcurado: nomeProcurado };
            }
        }
        return { file: null, nomeProcurado: nomeProcurado };
    }

    function caixaPossuiMesmoEPS(caixa, arquivoAlvo) {
        try {
            var graphics = caixa.allGraphics;
            if (graphics.length === 0) return false;
            var alvoFsName = String(arquivoAlvo.fsName).toLowerCase();

            for (var i = 0; i < graphics.length; i++) {
                try {
                    var link = graphics[i].itemLink;
                    if (link && link.isValid) {
                        var fileLink = link.filePath;
                        if (fileLink) {
                            var linkFsName = String(fileLink).toLowerCase();
                            if (linkFsName === alvoFsName) return true;
                        }
                    }
                } catch (eLink) {}
            }
        } catch (eGraphics) {}
        return false;
    }

    function centralizarGraficos(caixa) {
        try { caixa.fit(FitOptions.CENTER_CONTENT); } catch (eFit) {}
    }

    main();

})();