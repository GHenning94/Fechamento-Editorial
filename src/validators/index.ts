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

const STYLE_VALIDATOR_IDS = new Set<string>([
  "V05_ESTILOS_PADRAO_PROFESSOR",
  "V20_ESTILOS_PADRAO_CREDITO",
  "V22_ESTILOS_PADRAO_FONTE",
  "V09_ESTILOS_IDIOMA",
  "V10_HIFENIZACAO",
  "V11_ESTILOS_NOMENCLATURA",
  "V21_OVERTEXT",
  "V23_ESTILOS_PASTAS",
]);

/** Capas não têm estilo de parágrafo nem de caractere, nem memorial/rendimento de miolo. */
function createCoverValidators(): IValidator[] {
  return createAllValidators().filter((validator) => {
    if (STYLE_VALIDATOR_IDS.has(validator.id)) return false;
    if (validator.id === "V01_LAYERS_OBRIGATORIAS" || validator.id === "V02_LAYERS_NOMENCLATURA") {
      return false;
    }
    return true;
  });
}

export function createValidators(profile: "editorial" | "cover" = "editorial"): IValidator[] {
  return profile === "cover" ? createCoverValidators() : createAllValidators();
}

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
