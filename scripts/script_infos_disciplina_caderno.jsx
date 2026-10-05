#target "InDesign"

/*
============================================================
PREENCHIMENTO OTIMIZADO DE CADERNOS E DISCIPLINAS
Adobe InDesign - ExtendScript (.jsx)
============================================================
*/

(function () {
    if (app.documents.length === 0) {
        alert("Por favor, abra o seu documento do InDesign antes de rodar o script.");
        return;
    }

    var doc = app.activeDocument;
    var csvFile = File.openDialog("Selecione o arquivo CSV do seu Excel", function (f) {
        if (f instanceof Folder) return true;
        return /\.csv$/i.test(f.name);
    });

    if (!csvFile || !csvFile.open("r")) return;

    try { csvFile.encoding = "UTF-8"; } catch (e) {}
    var csvContent = csvFile.read();
    csvFile.close();
    csvContent = csvContent.replace(/^\uFEFF/, "");

    var linhas = csvContent.split(/\r\n|\n|\r/);
    var linhasValidas = [];
    for (var i = 0; i < linhas.length; i++) {
        if (linhas[i] && linhas[i].replace(/\s/g, "") !== "") {
            linhasValidas.push(linhas[i]);
        }
    }

    if (linhasValidas.length < 2) {
        alert("Erro: o arquivo CSV precisa possuir uma linha de cabeçalho e pelo menos uma linha de dados.");
        return;
    }

    var separador = (linhasValidas[0].indexOf(";") !== -1) ? ";" : ",";

    // 1. Leitura e Agrupamento Inteligente do CSV (Matéria 1 e 2)
    var dadosBrutos = [];
    for (var i = 1; i < linhasValidas.length; i++) {
        var col = parseCSVLine(linhasValidas[i], separador);
        if (col.length < 4) continue;
        dadosBrutos.push({
            cad: limparTexto(col[1]),
            mat: limparTexto(col[2]),
            disc: limparTexto(col[3])
        });
    }

    var capas = [];
    for (var i = 0; i < dadosBrutos.length; i++) {
        if (dadosBrutos[i].mat === "1") {
            capas.push({
                caderno: dadosBrutos[i].cad,
                disciplina1: dadosBrutos[i].disc,
                disciplina2: ""
            });
        } else if (dadosBrutos[i].mat === "2" && capas.length > 0) {
            capas[capas.length - 1].disciplina2 = dadosBrutos[i].disc;
        }
    }

    if (capas.length === 0) {
        alert("Nenhum dado válido agrupado a partir do CSV.");
        return;
    }

    var registroIndex = 0;
    var paginasModificadas = 0;

    app.doScript(function () {
        try {
            // Processa em blocos de 4 páginas (Capa nas posições 0 e 2 de cada bloco)
            for (var p = 0; p < doc.pages.length && registroIndex < capas.length; p += 4) {
                var pags = [doc.pages[p], doc.pages[p + 2]];

                for (var i = 0; i < pags.length && registroIndex < capas.length; i++) {
                    var paginaLayout = pags[i];
                    var capa = capas[registroIndex];
                    var aplicouAlgo = false;

                    // Override seguro de itens da página-mestre
                    if (paginaLayout.appliedMaster) {
                        var mItems = paginaLayout.appliedMaster.allPageItems;
                        for (var mi = 0; mi < mItems.length; mi++) {
                            if (mItems[mi] instanceof TextFrame) {
                                var txtM = mItems[mi].contents.toString().toUpperCase();
                                if (txtM.indexOf("<CADERNO") !== -1 || txtM.indexOf("<DISCIPLINA") !== -1) {
                                    obterOverrideSeguro(mItems[mi], paginaLayout);
                                }
                            }
                        }
                    }

                    // Varredura de caixas de texto na página local
                    var allItems = paginaLayout.textFrames;
                    var discFrames = [];

                    for (var j = 0; j < allItems.length; j++) {
                        var tf = allItems[j];
                        if (!tf || !tf.isValid) continue;

                        var txt = tf.contents.toString();
                        var txtUpper = txt.toUpperCase();

                        // Substituição do Caderno
                        if (txtUpper.indexOf("<<CADERNO>>") !== -1 || txtUpper.indexOf("<CADERNO>") !== -1) {
                            tf.contents = txt.replace(/<<CADERNO>>|<CADERNO>/gi, capa.caderno);
                            aplicouAlgo = true;
                        }
                        // Coleta caixas de disciplina
                        else if (txtUpper.indexOf("<<DISCIPLINA") !== -1 || txtUpper.indexOf("<DISCIPLINA") !== -1) {
                            discFrames.push(tf);
                            aplicouAlgo = true;
                        }
                    }

                    // Ordena e aplica as disciplinas verticalmente (topo para baixo)
                    if (discFrames.length > 0) {
                        discFrames.sort(function (a, b) {
                            return a.geometricBounds[0] - b.geometricBounds[0];
                        });

                        if (discFrames[0] && discFrames[0].isValid) {
                            var t1 = discFrames[0].contents.toString();
                            discFrames[0].contents = t1.replace(/<<DISCIPLINA_COMPONENTE_CURRICULAR>>|<DISCIPLINA_COMPONENTE_CURRICULAR>|<<DISCIPLINA.*>>|<DISCIPLINA.*>/gi, capa.disciplina1);
                        }

                        if (discFrames.length > 1 && discFrames[1] && discFrames[1].isValid) {
                            var t2 = discFrames[1].contents.toString();
                            var valDisc2 = (capa.disciplina2 !== "") ? capa.disciplina2 : "";
                            discFrames[1].contents = t2.replace(/<<DISCIPLINA_COMPONENTE_CURRICULAR>>|<DISCIPLINA_COMPONENTE_CURRICULAR>|<<DISCIPLINA.*>>|<DISCIPLINA.*>/gi, valDisc2);
                        }
                    }

                    if (aplicouAlgo) {
                        paginasModificadas++;
                    }
                    registroIndex++;
                }
            }
        } catch (e) {
            alert("Erro durante a execução: " + e);
        }
    }, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, "Preenchimento de Capas");

    alert("Processamento concluído com sucesso!\nCapas preenchidas: " + paginasModificadas);

    // --- Funções Auxiliares ---
    function obterOverrideSeguro(objetoMaster, pagina) {
        try {
            var idMaster = objetoMaster.id;
            var objetosPagina = pagina.allPageItems;
            for (var k = 0; k < objetosPagina.length; k++) {
                if (objetosPagina[k].overriddenMasterPageItem && objetosPagina[k].overriddenMasterPageItem.id === idMaster) {
                    return objetosPagina[k];
                }
            }
            return objetoMaster.override(pagina);
        } catch (e) {
            return null;
        }
    }

    function parseCSVLine(linha, sep) {
        var res = [];
        var atual = "";
        var aspas = false;
        for (var k = 0; k < linha.length; k++) {
            var c = linha.charAt(k);
            if (c === '"') {
                if (aspas && linha.charAt(k + 1) === '"') {
                    atual += '"';
                    k++;
                } else {
                    aspas = !aspas;
                }
            } else if (c === sep && !aspas) {
                res.push(atual);
                atual = "";
            } else {
                atual += c;
            }
        }
        res.push(atual);
        return res;
    }

    function limparTexto(val) {
        if (!val) return "";
        var txt = String(val).replace(/^\uFEFF/, "").replace(/^"|"$/g, "");
        return txt.replace(/^\s+|\s+$/g, "");
    }
})();