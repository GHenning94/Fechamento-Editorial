import { IValidator } from "../models/validator";
import { LayersObrigatoriasValidator, LayersNomenclaturaValidator } from "./layers-validator";
import { CoresValidator } from "./cores-validator";
import { CorProfValidator } from "./corprof-validator";
import { GuiasColorValidator } from "./guias-color-validator";
import { OverprintValidator } from "./overprint-validator";
import { EstilosIdiomaValidator } from "./estilos-idioma-validator";
import { EstilosNomenclaturaValidator } from "./estilos-nomenclatura-validator";
import { EstilosPastasValidator } from "./estilos-pastas-validator";
import { EstilosPadraoProfessorValidator } from "./estilos-padrao-professor-validator";
import { EstilosPadraoCreditoValidator } from "./estilos-padrao-credito-validator";
import { EstilosPadraoFonteValidator } from "./estilos-padrao-fonte-validator";
import { HifenizacaoValidator } from "./hifenizacao-validator";
import { FontesValidator } from "./fontes-validator";
import { FontesDuplicadasValidator } from "./fontes-duplicadas-validator";
import { LinksValidator } from "./links-validator";
import { ImagensColorspaceValidator } from "./imagens-colorspace-validator";
import { ImagensFormatoValidator } from "./imagens-formato-validator";
import { ResolucaoValidator } from "./resolucao-validator";
import { FiosValidator } from "./fios-validator";
import { PasteboardValidator } from "./pasteboard-validator";
import { OvertextValidator } from "./overtext-validator";
import { CinzaOverprintValidator } from "./cinza-overprint-validator";

export function createAllValidators(): IValidator[] {
  return [
    new LayersObrigatoriasValidator(),
    new LayersNomenclaturaValidator(),
    new CoresValidator(),
    new CorProfValidator(),
    new GuiasColorValidator(),
    new OverprintValidator(),
    new CinzaOverprintValidator(),
    new EstilosIdiomaValidator(),
    new EstilosNomenclaturaValidator(),
    new EstilosPastasValidator(),
    new EstilosPadraoProfessorValidator(),
    new EstilosPadraoCreditoValidator(),
    new EstilosPadraoFonteValidator(),
    new HifenizacaoValidator(),
    new FontesValidator(),
    new FontesDuplicadasValidator(),
    new LinksValidator(),
    new ImagensColorspaceValidator(),
    new ImagensFormatoValidator(),
    new ResolucaoValidator(),
    new FiosValidator(),
    new PasteboardValidator(),
    new OvertextValidator(),
  ];
}

export {
  LayersObrigatoriasValidator,
  LayersNomenclaturaValidator,
  CoresValidator,
  CorProfValidator,
  GuiasColorValidator,
  OverprintValidator,
  CinzaOverprintValidator,
  EstilosIdiomaValidator,
  EstilosNomenclaturaValidator,
  EstilosPastasValidator,
  EstilosPadraoProfessorValidator,
  EstilosPadraoCreditoValidator,
  EstilosPadraoFonteValidator,
  HifenizacaoValidator,
  FontesValidator,
  FontesDuplicadasValidator,
  LinksValidator,
  ImagensColorspaceValidator,
  ImagensFormatoValidator,
  ResolucaoValidator,
  FiosValidator,
  PasteboardValidator,
  OvertextValidator,
};
