(function() {
    if (app.documents.length === 0) return;
    
    var doc = app.activeDocument;
    
    // Coleta todos os links do documento que correspondam ao padrão (EPS numérico)
    var linksParaProcessar = [];
    var todosLinks = doc.links;
    
    for (var s = 0; s < todosLinks.length; s++) {
        var obj = todosLinks[s];
        if (obj.isValid && obj.name.match(/^[\d\-]+\.eps$/i)) {
            linksParaProcessar.push(obj);
        }
    }

    if (linksParaProcessar.length === 0) {
        alert("Nenhum arquivo EPS válido (código de barras) encontrado no documento.");
        return;
    }

    var removerTudo = false;

    // Varre os links encontrados para exibir o menu
    for (var i = linksParaProcessar.length - 1; i >= 0; i--) {
        // Se a opção de remover tudo do documento já foi acionada, sai do loop
        if (removerTudo) break; 

        var linkAtual = linksParaProcessar[i];

        if (!linkAtual.isValid) continue;

        var nomeOriginal = linkAtual.name;
        var acaoEscolhida = null;

        // Foca visualmente no objeto atual no InDesign para você saber qual está editando
        try {
            app.select(linkAtual.parent.parent);
        } catch(e) {}

        var win = new Window("dialog", "Configuração do Script");
        win.alignChildren = "fill";
        win.add("statictext", undefined, "Arquivo encontrado: " + nomeOriginal);
        
        var radioGroup = win.add("panel");
        radioGroup.alignChildren = "left";
        var rbSubst = radioGroup.add("radiobutton", undefined, "1. Substituir atual");
        var rbRem = radioGroup.add("radiobutton", undefined, "2. Remover atual");
        var rbRemT = radioGroup.add("radiobutton", undefined, "3. Remover todos (do documento)");
        rbSubst.value = true;
        
        var btnGroup = win.add("group");
        btnGroup.alignment = "center";
        
        // Adicionando os três botões lado a lado
        var btnOk = btnGroup.add("button", undefined, "Aplicar", {name: "ok"});
        var btnNext = btnGroup.add("button", undefined, "Próximo");
        var btnCancel = btnGroup.add("button", undefined, "Cancelar", {name: "cancel"});

        btnOk.onClick = function() { win.close(1); }
        btnNext.onClick = function() { win.close(2); }
        btnCancel.onClick = function() { win.close(0); }

        var acaoJanela = win.show();

        if (acaoJanela === 0) {
            break; // Clicou em Cancelar, encerra o script totalmente
        } else if (acaoJanela === 2) {
            continue; // Clicou em Próximo, pula para o próximo loop sem alterar nada
        }

        // Se chegou aqui, clicou em Aplicar (1)
        if (rbSubst.value) acaoEscolhida = "substituir";
        else if (rbRem.value) acaoEscolhida = "remover";
        else if (rbRemT.value) acaoEscolhida = "remover_todos_doc";

        // Executa a ação
        app.doScript(function() {
            if (acaoEscolhida === "remover_todos_doc") {
                removerTudo = true;
                var todosLinksDoc = doc.links;
                
                // Varre TODOS os links do documento de trás para frente
                for (var k = todosLinksDoc.length - 1; k >= 0; k--) {
                    if (todosLinksDoc[k].isValid && todosLinksDoc[k].name.match(/^[\d\-]+\.eps$/i)) {
                        try {
                            // link.parent representa o gráfico, removemos ele e a box fica branca
                            todosLinksDoc[k].parent.remove(); 
                        } catch(e) {}
                    }
                }
            } else {
                executarAcao(linkAtual, acaoEscolhida);
            }
        }, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, "Ação Código de Barras");
    }

    function executarAcao(link, acao) {
        try {
            if (acao === "substituir") {
                var arquivo = File.openDialog("Selecione o arquivo para substituir: " + link.name);
                if (arquivo) {
                    var container = link.parent;
                    var sH = container.horizontalScale;
                    var sV = container.verticalScale;
                    link.relink(arquivo);
                    link.update();
                    container.horizontalScale = sH;
                    container.verticalScale = sV;
                    container.parent.fit(FitOptions.CENTER_CONTENT);
                }
            } else if (acao === "remover") {
                // Remove apenas o conteúdo gráfico (imagem eps), mantendo a caixa/frame
                link.parent.remove();
            }
        } catch (e) {}
    }
})();