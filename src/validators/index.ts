import { IValidator } from "../models/validator";
import { LayersObrigatoriasValidator, LayersNomenclaturaValidator } from "./layers-validator";
import { MemorialDescritivoValidator } from "./memorial-descritivo-validator";
import { CoresValidator } from "./cores-validator";
import { CorProfValidator } from "./corprof-validator";
import { GuiasColorValidator } from "./guias-color-validator";
import { OverprintValidator } from "./overprint-validator";
import { EstilosIdiomaValidator } from "./estilos-idioma-validator";
import { EstilosNomenclaturaValidator } from "./estilos-nomenclatura-validator";
import { EstilosPadraoProfessorValidator } from "./estilos-padrao-professor-validator";
import { HifenizacaoValidator } from "./hifenizacao-validator";
import { FontesValidator } from "./fontes-validator";
import { FontesDuplicadasValidator } from "./fontes-duplicadas-validator";
import { LinksValidator } from "./links-validator";
import { ImagensColorspaceValidator } from "./imagens-colorspace-validator";
import { ResolucaoValidator } from "./resolucao-validator";
import { FiosValidator } from "./fios-validator";
import { PasteboardValidator } from "./pasteboard-validator";
import { LayersBloqueadasValidator } from "./layers-bloqueadas-validator";
import { OvertextValidator } from "./overtext-validator";

export function createAllValidators(): IValidator[] {
  return [
    new LayersObrigatoriasValidator(),
    new LayersNomenclaturaValidator(),
    new MemorialDescritivoValidator(),
    new CoresValidator(),
    new CorProfValidator(),
    new GuiasColorValidator(),
    new OverprintValidator(),
    new EstilosIdiomaValidator(),
    new EstilosNomenclaturaValidator(),
    new EstilosPadraoProfessorValidator(),
    new HifenizacaoValidator(),
    new FontesValidator(),
    new FontesDuplicadasValidator(),
    new LinksValidator(),
    new ImagensColorspaceValidator(),
    new ResolucaoValidator(),
    new FiosValidator(),
    new PasteboardValidator(),
    new LayersBloqueadasValidator(),
    new OvertextValidator(),
  ];
}

export {
  LayersObrigatoriasValidator,
  LayersNomenclaturaValidator,
  MemorialDescritivoValidator,
  CoresValidator,
  CorProfValidator,
  GuiasColorValidator,
  OverprintValidator,
  EstilosIdiomaValidator,
  EstilosNomenclaturaValidator,
  EstilosPadraoProfessorValidator,
  HifenizacaoValidator,
  FontesValidator,
  FontesDuplicadasValidator,
  LinksValidator,
  ImagensColorspaceValidator,
  ResolucaoValidator,
  FiosValidator,
  PasteboardValidator,
  LayersBloqueadasValidator,
  OvertextValidator,
};
